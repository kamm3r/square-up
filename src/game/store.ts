import { saveGhost } from './ghost.js'
import { LEVELS } from './levels.js'
import { isMuted, playSfx, setHidden, setMuted, startMusic } from './audio.js'

/** The title screen and the menus under it: no HUD, and the level plays as a backdrop. */
export type MenuScreen =
  | 'title'
  | 'levels'
  | 'settings'
  | 'settings-game'
  | 'settings-audio'
  | 'settings-video'
  | 'settings-controller'
  | 'settings-keyboard'
export type Screen = MenuScreen | 'playing' | 'paused' | 'complete' | 'victory'

/** Where Back (or Esc) goes from each menu. */
const MENU_PARENT: Record<MenuScreen, MenuScreen | null> = {
  title: null,
  levels: 'title',
  settings: 'title',
  'settings-game': 'settings',
  'settings-audio': 'settings',
  'settings-video': 'settings',
  'settings-controller': 'settings',
  'settings-keyboard': 'settings',
}
export const MENU_SCREENS = Object.keys(MENU_PARENT) as Screen[]

export type Result = { time: number; deaths: number; stars: number }

const SAVE_KEY = 'square-up:save'
type Save = {
  unlocked: number
  best: Record<number, Result>
  /** Stars ever collected per level (a star counts once you finish the level with it). */
  stars: Record<number, boolean[]>
}
const loadSave = (): Save => {
  try {
    return { unlocked: 0, best: {}, stars: {}, ...JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') }
  } catch {
    return { unlocked: 0, best: {}, stars: {} }
  }
}

export const countStars = (stars: Record<number, boolean[]>) =>
  Object.values(stars).reduce((n, s) => n + s.filter(Boolean).length, 0)

export type GameState = Save & {
  screen: Screen
  level: number
  /** Bumped to force the scene to rebuild (restart). */
  attempt: number
  deaths: number
  time: number
  last: Result | null
  /** Stars picked up in the current run. */
  runStars: boolean[]
  /** Which stars in the last finished run were new. */
  newStars: boolean[]
  muted: boolean
}

/** The whole game state. Read it freely; change it only through the actions below. */
export const state: GameState = {
  ...loadSave(),
  screen: 'title',
  level: 0,
  attempt: 0,
  deaths: 0,
  time: 0,
  last: null,
  runStars: [],
  newStars: [],
  muted: isMuted(),
}

const listeners = new Set<() => void>()

/** Call `fn` after every state change. */
export function subscribe(fn: () => void) {
  listeners.add(fn)
}

function set(patch: Partial<GameState>) {
  Object.assign(state, patch)
  for (const fn of listeners) fn()
}

export function startLevel(level: number) {
  startMusic()
  playSfx('tap')
  set({ screen: 'playing', level, attempt: state.attempt + 1, deaths: 0, time: 0, runStars: [] })
}

export const restart = () => set({ screen: 'playing', attempt: state.attempt + 1, deaths: 0, time: 0, runStars: [] })
export const died = () => set({ deaths: state.deaths + 1 })
export const setTime = (time: number) => set({ time })
export const setRunStars = (runStars: boolean[]) => set({ runStars })

/** `ghost` is the run's recording (see ghost.ts), kept if this is the level's new best time. */
export function completeLevel(time: number, runStars: boolean[], ghost: string) {
  const { level, deaths, best, unlocked, stars } = state
  const old = stars[level] ?? []
  const merged = runStars.map((got, i) => got || !!old[i])
  const result = { time, deaths, stars: runStars.filter(Boolean).length }
  const prev = best[level]
  if (!prev || time < prev.time) saveGhost(LEVELS[level], ghost)
  const save: Save = {
    unlocked: Math.max(unlocked, Math.min(level + 1, LEVELS.length - 1)),
    best: { ...best, [level]: !prev || time < prev.time ? result : prev },
    stars: { ...stars, [level]: merged },
  }
  localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  set({
    ...save,
    last: result,
    newStars: runStars.map((got, i) => got && !old[i]),
    screen: level === LEVELS.length - 1 ? 'victory' : 'complete',
  })
}

export const nextLevel = () => startLevel(state.level + 1)

export function togglePause() {
  if (state.screen === 'playing') set({ screen: 'paused' })
  else if (state.screen === 'paused') set({ screen: 'playing' })
}

export const toTitle = () => set({ screen: 'title' })

// switching tabs or apps (or locking the phone) pauses the game and silences it until you're back
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === 'playing') togglePause()
  setHidden(document.hidden)
})

/** Open one of the menus. */
export function showMenu(screen: MenuScreen) {
  playSfx('tap', 0.3)
  set({ screen })
}

/** Back up one menu, e.g. from Audio to Settings, or from Settings to the title. */
export function backMenu() {
  const parent = MENU_PARENT[state.screen as MenuScreen]
  if (parent) showMenu(parent)
}

export function toggleMute() {
  const muted = !state.muted
  setMuted(muted)
  set({ muted })
}
