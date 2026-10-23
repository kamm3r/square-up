// The few parts of node's built-in modules that tools/serve.ts uses. The project has no node type
// declarations (it doesn't use npm), so these are written out by hand, like a small C header.

declare module 'node:http' {
  interface IncomingMessage {
    url?: string
    method?: string
    headers: Record<string, string | string[] | undefined>
  }
  interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string | number>): void
    end(body?: Uint8Array | string): void
  }
  interface Server {
    listen(port: number, host: string, callback?: () => void): void
    on(event: 'error', callback: (error: Error) => void): void
  }
  function createServer(handler: (request: IncomingMessage, response: ServerResponse) => void): Server
}

declare module 'node:fs/promises' {
  function readFile(path: URL): Promise<Uint8Array>
  function stat(path: URL): Promise<{ isDirectory(): boolean; mtimeMs: number }>
}

declare module 'node:zlib' {
  function gzipSync(data: Uint8Array): Uint8Array
}
