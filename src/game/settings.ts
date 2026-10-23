// Player settings from the Settings menu, kept in localStorage between sessions.

const KEY = 'square-up:settings'

/** Things a key can be bound to. Esc always pauses (and backs out of menus) on top of these. */
export type Action = 'left' | 'right' | 'jump' | 'pause' | 'restart' | 'mute'

/** Most keys one action can have. */
export const MAX_KEYS = 3

/** Keys by `KeyboardEvent.code`, which names the physical key, so it works on any layout. */
export const DEFAULT_KEYS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  pause: ['KeyP'],
  restart: ['KeyR'],
  mute: ['KeyM'],
}

export type Settings = {
  /** Volumes from 0 (silent) to 10. */
  music: number
  sfx: number
  shake: boolean
  /** Replay the best run as a see-through hero. */
  ghost: boolean
  /** Show the frame rate counter (also on with ?fps in the address). */
  fps: boolean
  keys: Record<Action, string[]>
}

export const VOLUME_STEPS = 10

const copyKeys = (keys: Record<Action, string[]>) =>
  Object.fromEntries(Object.entries(keys).map(([action, codes]) => [action, [...codes]])) as Record<Action, string[]>

export const settings: Settings = { music: 7, sfx: 8, shake: true, ghost: true, fps: false, keys: copyKeys(DEFAULT_KEYS) }
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
  // actions added in a later version keep their default keys
  Object.assign(settings, saved, { keys: { ...copyKeys(DEFAULT_KEYS), ...saved.keys } })
} catch {
  // unreadable settings: keep the defaults
}

const listeners = new Set<() => void>()

/** Call `fn` whenever a setting changes. */
export function onSettingsChange(fn: () => void) {
  listeners.add(fn)
}

export function changeSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings[key] = value
  localStorage.setItem(KEY, JSON.stringify(settings))
  for (const fn of listeners) fn()
}

/** Is this key bound to the action? */
export const isBound = (action: Action, code: string) => settings.keys[action].includes(code)

/** Make `code` the action's first key, taking it away from any other action. */
export function bindKey(action: Action, code: string) {
  const keys = copyKeys(settings.keys)
  for (const a of Object.keys(keys) as Action[]) keys[a] = keys[a].filter((c) => c !== code)
  keys[action] = [code, ...keys[action]].slice(0, MAX_KEYS)
  changeSetting('keys', keys)
}

export const resetKeys = () => changeSetting('keys', copyKeys(DEFAULT_KEYS))
