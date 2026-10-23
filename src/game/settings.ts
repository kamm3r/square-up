// Player settings from the Settings menu, kept in localStorage between sessions.

const KEY = 'square-up:settings'

export type Settings = {
  /** Volumes from 0 (silent) to 10. */
  music: number
  sfx: number
  shake: boolean
  /** Replay the best run as a see-through hero. */
  ghost: boolean
  /** Show the frame rate counter (also on with ?fps in the address). */
  fps: boolean
}

export const VOLUME_STEPS = 10

export const settings: Settings = { music: 7, sfx: 8, shake: true, ghost: true, fps: false }
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}'))
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
