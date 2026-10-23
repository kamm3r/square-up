export type InputState = { left: boolean; right: boolean; jump: boolean }

const keys = new Set<string>()

const LEFT = ['ArrowLeft', 'KeyA']
const RIGHT = ['ArrowRight', 'KeyD']
const JUMP = ['Space', 'ArrowUp', 'KeyW', 'KeyZ']
const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...JUMP])

window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  // stop page scrolling, but let focused menu buttons still react to Space
  if (GAME_KEYS.has(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault()
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('blur', () => {
  keys.clear()
  touches.clear()
  updateTouchState()
})

// ---------- touch: the left half of the screen moves, the right half jumps
//
// Big zones instead of small buttons, so a thumb that drifts never loses its input. Only the
// thumb's horizontal position matters for moving: left or right of the middle of the ◀▶ pad
// (with a small dead zone in the middle), so rolling your thumb across switches direction.

const DEAD_ZONE = 8 // CSS pixels either side of the pad's middle

type Touch = { zone: 'move' | 'jump'; x: number }
const touches = new Map<number, Touch>()
let touchEnabled = false
let padCenter = 0
const touchState = { left: false, right: false, jump: false }

/** Only while playing; in menus, touches are taps on buttons. */
export function setTouchEnabled(enabled: boolean) {
  touchEnabled = enabled
  if (!enabled) touches.clear()
  updateTouchState()
}

function updateTouchState() {
  let dx = 0
  touchState.jump = false
  // the most recent finger on the move side wins
  for (const t of touches.values()) {
    if (t.zone === 'jump') touchState.jump = true
    else dx = t.x - padCenter
  }
  touchState.left = dx < -DEAD_ZONE
  touchState.right = dx > DEAD_ZONE
  // light up what's held
  for (const button of ['left', 'right', 'jump'] as const)
    document.querySelector(`[data-touch="${button}"]`)?.classList.toggle('active', touchState[button])
}

window.addEventListener('pointerdown', (e) => {
  if (!touchEnabled || e.pointerType === 'mouse') return
  // HUD buttons (pause, sound) still work as buttons
  if ((e.target as Element).closest('button')) return
  const zone = e.clientX < window.innerWidth / 2 ? 'move' : 'jump'
  if (zone === 'move') {
    const pad = document.querySelector('.touch-move')?.getBoundingClientRect()
    padCenter = pad ? pad.left + pad.width / 2 : window.innerWidth / 4
  }
  touches.set(e.pointerId, { zone, x: e.clientX })
  updateTouchState()
  e.preventDefault()
}, { passive: false })

window.addEventListener('pointermove', (e) => {
  const t = touches.get(e.pointerId)
  if (!t) return
  t.x = e.clientX
  updateTouchState()
  e.preventDefault()
}, { passive: false })

const endTouch = (e: PointerEvent) => {
  if (touches.delete(e.pointerId)) updateTouchState()
}
window.addEventListener('pointerup', endTouch)
window.addEventListener('pointercancel', endTouch)

const any = (codes: string[]) => codes.some((c) => keys.has(c))

export const input: InputState = { left: false, right: false, jump: false }

export function readInput(): InputState {
  input.left = any(LEFT) || touchState.left
  input.right = any(RIGHT) || touchState.right
  input.jump = any(JUMP) || touchState.jump
  return input
}
