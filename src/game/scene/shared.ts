import {
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
  type Object3D,
  type Texture,
} from 'three'

const PX = 16 // pixels per tile
export const PIXEL = 1 / PX
const TARGET_HEIGHT = 288 // roughly how many art pixels tall the view is

/** Per-frame values computed by the level scene and read by everything that renders. */
export type FrameState = {
  /** 0..1 between the previous and current physics step, for smooth interpolation. */
  alpha: number
  /** Interpolated sim time (drives saws and springs). */
  time: number
  /** Seconds since the page loaded (drives purely visual animation). */
  clock: number
  px: number
  py: number
  /** Player squash & stretch: >1 tall, <1 flat; springs back to 1 with a little wobble. */
  squash: number
  squashVel: number
  /** Screen shake strength, decays to 0. */
  shake: number
  /** Camera position this frame. */
  camX: number
  camY: number
}

export const createFrameState = (x: number, y: number): FrameState => ({
  alpha: 0,
  time: 0,
  clock: 0,
  px: x,
  py: y,
  squash: 1,
  squashVel: 0,
  shake: 0,
  camX: x,
  camY: y,
})

export type View = {
  halfW: number
  halfH: number
  /** Device pixels per world unit, for snapping the camera to whole screen pixels. */
  unitPx: number
  /** Camera zoom: screen (CSS) pixels per world unit. */
  zoom: number
  dpr: number
}

/**
 * Renders one canvas pixel per screen (CSS) pixel with an integer zoom: every art pixel is exactly
 * `scale` screen pixels (textures use nearest filtering, so they stay crisp), and things can still
 * move by single screen pixels. Rendering at the art's low resolution instead makes moving
 * platforms visibly jitter.
 *
 * High-density screens (phones are 2x or 3x) don't get more canvas pixels: the browser scales the
 * canvas up with `image-rendering: pixelated`, so the art looks exactly the same, while the GPU
 * fills 4x (2x screens) or 9x (3x screens) fewer pixels.
 */
export function pixelView(width: number, height: number): View {
  const scale = Math.max(1, Math.round(height / TARGET_HEIGHT))
  const dpr = 1
  return {
    halfW: width / (PX * scale) / 2,
    halfH: height / (PX * scale) / 2,
    unitPx: PX * scale * dpr,
    zoom: PX * scale,
    dpr,
  }
}

/** Plane whose UVs repeat the texture once per tile. */
export function tiledPlane(w: number, h: number, tileW = 1, tileH = 1) {
  const g = new PlaneGeometry(w, h)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tileW, (uv.getY(i) * h) / tileH)
  return g
}

type MeshOptions = {
  map?: Texture
  color?: ColorRepresentation
  alphaTest?: number
  transparent?: boolean
  opacity?: number
  x?: number
  y?: number
  z?: number
}

/** Flat unlit mesh: the only kind of object this game draws. */
export function mesh(geometry: BufferGeometry, o: MeshOptions = {}) {
  const material = new MeshBasicMaterial({
    map: o.map ?? null,
    color: o.color ?? 0xffffff,
    alphaTest: o.alphaTest ?? 0,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    depthWrite: !o.transparent,
  })
  const m = new Mesh(geometry, material)
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0)
  return m
}

export const basic = (m: Mesh) => m.material as MeshBasicMaterial

/**
 * Free the GPU memory of everything under `root`: geometries and materials. Textures are left
 * alone; whoever created them disposes them (most are shared between levels).
 */
export function disposeTree(root: Object3D) {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    ;(o.geometry as BufferGeometry).dispose()
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats as Material[]) m.dispose()
  })
}

/** Small deterministic random generator, so decorations land in the same place every load. */
export const seeded = (seed: number) => {
  let s = seed % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}
