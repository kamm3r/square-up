# Square Up

A small pixel-art platformer in five levels, written in TypeScript with three.js for drawing and
p2-es for physics. No framework, no bundler and no npm: the libraries are files in `lib/`, the
compiler is a binary in `lib/`, and a Makefile builds it.

## Build and play

```
make deps     # once: downloads three.js, p2-es and the TypeScript compiler into lib/
make serve    # compiles, then serves on http://localhost:5317
```

You need `curl` and `tar` for `make deps`, and `python3` for `make serve` (any static file server
works; ES modules just can't load from `file://`). `make watch` recompiles on every save.

## Layout

```
index.html        the page; its import map points `three` and `p2-es` at lib/
style.css         menus and HUD
src/              the game (TypeScript)
  main.ts           renderer, camera and the frame loop
  game/levels.ts    every level layout
  game/sim.ts       physics and game rules, knows nothing about drawing
  game/scene/       three.js drawing: background, world objects, player, particles
  ui/overlay.ts     HTML menus and HUD
public/           sounds and fonts
lib/              third-party code, like a C/C++ include folder (see tools/fetch-deps.sh)
build/            compiler output, loaded by index.html
tools/            dependency download script and the level-check bot
```

## Checking levels

`make check-levels` (needs node) runs a bot through every level, once on the main path and once
collecting all stars, with input limited to what a person can press. Run it after changing a level.
