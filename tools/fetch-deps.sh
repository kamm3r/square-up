#!/bin/sh
# Downloads the dependencies into lib/, like dropping a library into a C/C++ project.
# Nothing is installed globally and npm is not needed: these are plain tarballs from the npm registry.
#
#   lib/three/        three.js itself (three.module.js + three.core.js) and its type declarations
#   lib/p2-es/        p2-es, the 2D physics engine (one self-contained ES module + its declarations)
#   lib/typescript/   the TypeScript 7 compiler: a single native `tsc` binary plus the lib.*.d.ts files
#
# To upgrade, change a version below, delete the folder in lib/ and run `make deps` again.
set -eu

THREE_VERSION=0.186.1
THREE_TYPES_VERSION=0.186.0
P2_VERSION=1.2.3
TYPESCRIPT_VERSION=7.0.2

REGISTRY=https://registry.npmjs.org
ROOT=$(cd "$(dirname "$0")/.." && pwd)
LIB="$ROOT/lib"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# fetch <url> <dir>: download a .tgz and unpack it into a fresh directory
fetch() {
  echo "  $1"
  mkdir -p "$2"
  curl -fsSL "$1" -o "$TMP/pkg.tgz"
  tar -xzf "$TMP/pkg.tgz" -C "$2" --strip-components=1
}

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) PLATFORM=linux-x64 ;;
  Linux-aarch64 | Linux-arm64) PLATFORM=linux-arm64 ;;
  Darwin-x86_64) PLATFORM=darwin-x64 ;;
  Darwin-arm64) PLATFORM=darwin-arm64 ;;
  MINGW* | MSYS* | CYGWIN*) PLATFORM=win32-x64 ;;
  *) echo "unknown platform $(uname -s)-$(uname -m), edit tools/fetch-deps.sh" >&2; exit 1 ;;
esac

if [ ! -f "$LIB/three/three.module.js" ]; then
  echo "three.js $THREE_VERSION"
  fetch "$REGISTRY/three/-/three-$THREE_VERSION.tgz" "$TMP/three"
  fetch "$REGISTRY/@types/three/-/three-$THREE_TYPES_VERSION.tgz" "$TMP/three-types"
  mkdir -p "$LIB/three/types"
  # the browser needs these two files (three.module.js imports three.core.js)
  cp "$TMP/three/build/three.module.js" "$TMP/three/build/three.core.js" "$TMP/three/LICENSE" "$LIB/three/"
  # the compiler needs the declarations (core only, the examples/addons aren't used)
  cp -r "$TMP/three-types/index.d.ts" "$TMP/three-types/src" "$TMP/three-types/LICENSE" "$LIB/three/types/"
fi

if [ ! -f "$LIB/p2-es/p2-es.js" ]; then
  echo "p2-es $P2_VERSION"
  fetch "$REGISTRY/p2-es/-/p2-es-$P2_VERSION.tgz" "$TMP/p2"
  mkdir -p "$LIB/p2-es"
  cp "$TMP/p2/dist/p2-es.js" "$TMP/p2/dist/p2-es.d.ts" "$TMP/p2/LICENSE" "$LIB/p2-es/"
fi

if [ ! -f "$LIB/typescript/tsc" ] && [ ! -f "$LIB/typescript/tsc.exe" ]; then
  echo "TypeScript $TYPESCRIPT_VERSION ($PLATFORM)"
  fetch "$REGISTRY/@typescript/typescript-$PLATFORM/-/typescript-$PLATFORM-$TYPESCRIPT_VERSION.tgz" "$TMP/ts"
  mkdir -p "$LIB/typescript"
  cp -r "$TMP/ts/lib/." "$TMP/ts/LICENSE" "$LIB/typescript/"
  chmod +x "$LIB/typescript/tsc"* 2>/dev/null || true
fi

echo "lib/ is ready"
