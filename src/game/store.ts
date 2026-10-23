import { LEVELS } from './levels.js'
import { isMuted, playSfx, setMuted, startMusic } from './audio.js'

export type Screen = 'start' | 'title' | 'playing' | 'paused' | 'complete' | 'victory'
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
  screen: 'start',
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

/** Leave the start screen for the level menu. It's the first key or tap, so sound can start. */
export function openMenu() {
  startMusic()
  playSfx('tap')
  set({ screen: 'title' })
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

export function completeLevel(time: number, runStars: boolean[]) {
  const { level, deaths, best, unlocked, stars } = state
  const old = stars[level] ?? []
  const merged = runStars.map((got, i) => got || !!old[i])
  const result = { time, deaths, stars: runStars.filter(Boolean).length }
  const prev = best[level]
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

export function toggleMute() {
  const muted = !state.muted
  setMuted(muted)
  set({ muted })
}
