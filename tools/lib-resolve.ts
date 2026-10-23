// Loaded with `node --import ./build/tools/lib-resolve.js` so node finds the libraries in lib/
// (node only looks in node_modules on its own). The browser gets the same mapping from the
// import map in index.html.
// @ts-ignore: node's built-in module, there are no node type declarations in this project
import { registerHooks } from 'node:module'

const LIBS: Record<string, string> = {
  'p2-es': '../../lib/p2-es/p2-es.js',
  three: '../../lib/three/three.module.js',
}

type Next = (specifier: string, context: unknown) => unknown

registerHooks({
  resolve(specifier: string, context: unknown, next: Next) {
    const lib = LIBS[specifier]
    return lib ? { url: new URL(lib, import.meta.url).href, shortCircuit: true } : next(specifier, context)
  },
})
