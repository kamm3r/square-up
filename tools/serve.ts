// Development server for `make serve` and `make share`: node build/tools/serve.js PORT [ADDRESS]
//
// Serves the project folder over HTTP (the game's ES modules can't load from file://). Every file
// is sent with Cache-Control: no-cache, so the browser checks for a newer copy on each load and a
// plain refresh after a rebuild always shows the latest JS and CSS. Text files are sent gzipped
// (three.js shrinks from 2.1 MB to 0.4 MB), which matters when testing on a phone over Tailscale.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

declare const process: { argv: string[]; exit(code: number): never }

const port = Number(process.argv[2] ?? 5317)
const address = process.argv[3] ?? '127.0.0.1'

/** The project folder: this file runs as build/tools/serve.js. */
const ROOT = new URL('../../', import.meta.url)

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  map: 'application/json',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  ttf: 'font/ttf',
  txt: 'text/plain; charset=utf-8',
}

const COMPRESS = new Set(['html', 'css', 'js', 'map', 'json', 'svg', 'txt'])

/** Gzipped copies of text files, redone when the file changes. */
const gzipped = new Map<string, { mtime: number; body: Uint8Array }>()

function gzipFor(file: URL, mtime: number, body: Uint8Array) {
  const cached = gzipped.get(file.href)
  if (cached?.mtime === mtime) return cached.body
  const gz = gzipSync(body)
  gzipped.set(file.href, { mtime, body: gz })
  return gz
}

/** The file a request asks for. Anything outside the project folder is refused. */
async function fileFor(url: string): Promise<URL> {
  const path = decodeURIComponent(new URL(url, 'http://local').pathname)
  // checked after decoding, so an encoded "../" (like %2e%2e%2f) can't climb out either
  const file = new URL('.' + path, ROOT)
  if (!file.href.startsWith(ROOT.href)) throw new Error('outside the project')
  return (await stat(file)).isDirectory() ? new URL('index.html', file.href.endsWith('/') ? file : file.href + '/') : file
}

const server = createServer(async (request, response) => {
  try {
    const file = await fileFor(request.url ?? '/')
    let body = await readFile(file)
    const ext = file.pathname.split('.').pop() ?? ''
    const headers: Record<string, string | number> = {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      Vary: 'Accept-Encoding',
    }
    if (COMPRESS.has(ext) && String(request.headers['accept-encoding'] ?? '').includes('gzip')) {
      body = gzipFor(file, (await stat(file)).mtimeMs, body)
      headers['Content-Encoding'] = 'gzip'
    }
    headers['Content-Length'] = body.byteLength
    response.writeHead(200, headers)
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
})

server.on('error', (error) => {
  console.error(`Couldn't start the server: ${error.message}`)
  process.exit(1)
})
server.listen(port, address)
