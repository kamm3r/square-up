import { OrthographicCamera, WebGLRenderer } from 'three'
import { LevelScene } from './game/level-scene.js'
import { LEVELS } from './game/levels.js'
import { pixelView, type View } from './game/scene/shared.js'
import { state } from './game/store.js'
import { createTextures } from './game/textures.js'
import { mountOverlay } from './ui/overlay.js'

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const renderer = new WebGLRenderer({ canvas, antialias: false })
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
camera.position.z = 50
const textures = createTextures()

let view: View = pixelView(window.innerWidth, window.innerHeight)
let level: LevelScene | null = null
/** Which level + attempt `level` was built for; a new one is built when this changes. */
let built = ''

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  view = pixelView(w, h)
  renderer.setPixelRatio(view.dpr)
  renderer.setSize(w, h)
  camera.left = -w / 2
  camera.right = w / 2
  camera.top = h / 2
  camera.bottom = -h / 2
  camera.zoom = view.zoom
  camera.updateProjectionMatrix()
  built = '' // the background is sized to the view, so rebuild
}
window.addEventListener('resize', resize)
resize()

mountOverlay(document.querySelector('#overlay')!)

// add ?fps to the address to see the frame rate and the slowest frame, e.g. to check a phone
const fpsBox = new URLSearchParams(location.search).has('fps') ? document.body.appendChild(document.createElement('div')) : null
if (fpsBox) fpsBox.id = 'fps'
let fpsFrames = 0
let fpsWorst = 0
let fpsSince = performance.now()

function countFrame(now: number, delta: number) {
  fpsFrames++
  fpsWorst = Math.max(fpsWorst, delta)
  if (now - fpsSince < 500) return
  fpsBox!.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsSince))} fps, slowest ${Math.round(fpsWorst * 1000)} ms`
  fpsFrames = fpsWorst = 0
  fpsSince = now
}

let last = performance.now()
function frame(now: number) {
  const delta = (now - last) / 1000
  last = now
  if (fpsBox) countFrame(now, delta)
  const key = `${state.level}-${state.attempt}`
  if (key !== built || !level) {
    level?.dispose()
    level = new LevelScene(LEVELS[state.level], view, textures, state.stars[state.level] ?? [])
    built = key
  }
  level.update(delta, now / 1000, camera)
  renderer.render(level.scene, camera)
  ;(window as unknown as { gameStarted: boolean }).gameStarted = true
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
