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
/** A level is being played: touches steer the hero, and the gamepad does too. */
let playing = false
let padCenter = 0
const touchState = { left: false, right: false, jump: false }

/** Only while playing; in menus, touches are taps on buttons and the gamepad drives the menu. */
export function setPlaying(value: boolean) {
  if (value === playing) return
  if (value) ignorePadJump = true // A that started the level isn't a jump
  playing = value
  if (!value) touches.clear()
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
  if (!playing || e.pointerType === 'mouse') return
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

// ---------- gamepad (standard mapping: Xbox, PlayStation, Switch Pro and most others)
//
// In a level the stick or d-pad moves and A jumps. Everywhere else the pad presses the same keys
// as the keyboard (arrows, Esc, R), so menus and pause need no gamepad code of their own.

const STICK_DEAD_ZONE = 0.4
const BUTTON = { a: 0, b: 1, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 }
const padState = { left: false, right: false, jump: false }
let padHeld = new Set<number>()
let stickWas = { x: 0, y: 0 }
let ignorePadJump = false

/** Pretend a key was tapped, for the menus' keyboard handling. */
function tapKey(code: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
  window.dispatchEvent(new KeyboardEvent('keyup', { code }))
}

/** Read the first connected gamepad. Call once per frame. */
export function pollGamepad() {
  const pad = navigator.getGamepads?.().find((p) => p?.connected)
  if (!pad) {
    padState.left = padState.right = padState.jump = false
    return
  }
  const held = new Set(pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])))
  const pressed = (button: number) => held.has(button) && !padHeld.has(button)
  // the stick counts as a d-pad press when it crosses the dead zone
  const stick = {
    x: Math.abs(pad.axes[0] ?? 0) > STICK_DEAD_ZONE ? Math.sign(pad.axes[0]) : 0,
    y: Math.abs(pad.axes[1] ?? 0) > STICK_DEAD_ZONE ? Math.sign(pad.axes[1]) : 0,
  }

  if (!held.has(BUTTON.a)) ignorePadJump = false
  padState.left = stick.x < 0 || held.has(BUTTON.left)
  padState.right = stick.x > 0 || held.has(BUTTON.right)
  padState.jump = held.has(BUTTON.a) && !ignorePadJump

  if (pressed(BUTTON.start)) tapKey('Escape')
  if (playing) {
    if (pressed(BUTTON.back)) tapKey('KeyR')
  } else {
    if (pressed(BUTTON.up) || (stick.y < 0 && stickWas.y >= 0)) tapKey('ArrowUp')
    if (pressed(BUTTON.down) || (stick.y > 0 && stickWas.y <= 0)) tapKey('ArrowDown')
    if (pressed(BUTTON.left) || (stick.x < 0 && stickWas.x >= 0)) tapKey('ArrowLeft')
    if (pressed(BUTTON.right) || (stick.x > 0 && stickWas.x <= 0)) tapKey('ArrowRight')
    if (pressed(BUTTON.a)) (document.activeElement as HTMLElement | null)?.click()
    if (pressed(BUTTON.b)) tapKey('Escape')
  }
  padHeld = held
  stickWas = stick
}

const any = (codes: string[]) => codes.some((c) => keys.has(c))

export const input: InputState = { left: false, right: false, jump: false }

export function readInput(): InputState {
  input.left = any(LEFT) || touchState.left || padState.left
  input.right = any(RIGHT) || touchState.right || padState.right
  input.jump = any(JUMP) || touchState.jump || padState.jump
  return input
}
