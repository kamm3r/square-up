import { setTouchEnabled } from '../game/input.js'
import { LEVELS } from '../game/levels.js'
import * as game from '../game/store.js'
import { countStars, state } from '../game/store.js'

// The overlay is plain HTML on top of the canvas. Screens are rebuilt from template strings
// when they change; values that tick every frame (time, stars) are patched in place.
// Buttons say what they do with data-action, handled by one click listener at the bottom.

export const formatTime = (t: number) => {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

const TOTAL_STARS = LEVELS.reduce((n, l) => n + l.stars.length, 0)

/** 9x9 pixel star drawn with crisp SVG rects. */
const STAR_ROWS = ['....#....', '...###...', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '.#.....#.']
const STAR_RECTS = STAR_ROWS.flatMap((row, y) =>
  [...row].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')),
).join('')

function starIcon(filled: boolean, size = 18, isNew = false) {
  const cls = `star-icon${filled ? ' filled' : ''}${isNew ? ' new' : ''}`
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 9 9" shape-rendering="crispEdges">${STAR_RECTS}</svg>`
}

function starRow(stars: boolean[], count: number, size?: number, newStars?: boolean[]) {
  const icons = Array.from({ length: count }, (_, i) => starIcon(!!stars[i], size, !!newStars?.[i])).join('')
  return `<span class="star-row">${icons}</span>`
}

const stats = (time: number, deaths: number) => `
  <div class="stats">
    <div><small>time</small>${formatTime(time)}</div>
    <div><small>deaths</small>${deaths}</div>
  </div>`

const soundLabel = () => (state.muted ? 'Sound off' : 'Sound on')

// ---------- screens

function titleScreen() {
  const { unlocked, best, stars } = state
  const levels = LEVELS.map((l, i) => {
    const time = best[i] ? formatTime(best[i].time) : i > unlocked ? 'locked' : '--'
    return `
      <button data-action="start" data-level="${i}" ${i > unlocked ? 'disabled' : ''} title="${l.name}">
        <strong>${i + 1}</strong>
        ${starRow(stars[i] ?? [], l.stars.length, 11)}
        <small>${time}</small>
      </button>`
  }).join('')
  return `
    <div class="panel title">
      <h1>SQUARE<span>UP</span></h1>
      <p class="sub">a tiny platformer in 5 levels</p>
      <button class="primary" data-action="start" data-level="${unlocked}">
        ${unlocked > 0 ? `Continue (level ${unlocked + 1})` : 'Play'}
      </button>
      <div class="levels">${levels}</div>
      <p class="total-stars">${starIcon(true, 14)} ${countStars(stars)} / ${TOTAL_STARS}</p>
      <div class="controls keys-only">
        <div><kbd>A</kbd><kbd>D</kbd> / <kbd>&larr;</kbd><kbd>&rarr;</kbd> move</div>
        <div><kbd>Space</kbd> / <kbd>W</kbd> jump (hold for higher)</div>
        <div><kbd>R</kbd> restart &nbsp; <kbd>Esc</kbd> pause &nbsp; <kbd>M</kbd> mute</div>
      </div>
      <div class="controls touch-only">
        <div>Left half of the screen: move (slide your thumb)</div>
        <div>Right half: jump (hold for higher)</div>
      </div>
      <button class="link" data-action="mute">Sound: ${state.muted ? 'off' : 'on'}</button>
    </div>`
}

function startScreen() {
  const collected = countStars(state.stars)
  return `
    <div class="start">
      <div class="start-hero"><div class="hero"></div><div class="hero-shadow"></div></div>
      <h1 class="logo">SQUARE<span>UP</span></h1>
      <p class="tagline">a tiny platformer in ${LEVELS.length} levels</p>
      <p class="press keys-only">press any key to start</p>
      <p class="press touch-only">tap to start</p>
      ${collected > 0 ? `<p class="start-stars">${starIcon(true, 14)} ${collected} / ${TOTAL_STARS}</p>` : ''}
    </div>`
}

const pausedScreen = () => `
  <div class="panel">
    <h2>Paused</h2>
    <button class="primary" data-action="pause">Resume</button>
    <button data-action="restart">Restart level</button>
    <button data-action="title">Main menu</button>
  </div>`

function completeScreen() {
  const { level, last, best, stars, newStars } = state
  const record = best[level]
  const isRecord = last && record && last.time === record.time
  const levelStars = stars[level] ?? []
  const missing = LEVELS[level].stars.length - levelStars.filter(Boolean).length
  return `
    <div class="panel">
      <h2>Level clear!</h2>
      <div class="big-stars">${starRow(levelStars, LEVELS[level].stars.length, 36, newStars)}</div>
      ${stats(last?.time ?? 0, last?.deaths ?? 0)}
      ${isRecord ? '<p class="record">New best time!</p>' : record ? `<p>Best: ${formatTime(record.time)}</p>` : ''}
      ${missing > 0 ? `<p class="dim">${missing === 1 ? '1 star' : `${missing} stars`} still hidden here...</p>` : ''}
      <button class="primary" data-action="next">Next level &rarr;</button>
      <button data-action="restart">Retry</button>
      <button data-action="title">Main menu</button>
    </div>`
}

function victoryScreen() {
  const { best, last, stars, newStars, level } = state
  const total = Object.values(best).reduce((sum, r) => sum + r.time, 0)
  const collected = countStars(stars)
  const perfect = collected === TOTAL_STARS
  return `
    <div class="panel">
      <h2>You did it!</h2>
      <p>All ${LEVELS.length} levels cleared. Square is proud of you.</p>
      <div class="big-stars">${starRow(stars[level] ?? [], LEVELS[level].stars.length, 36, newStars)}</div>
      ${stats(last?.time ?? 0, last?.deaths ?? 0)}
      <p>Sum of best times: ${formatTime(total)}</p>
      <p class="${perfect ? 'record' : ''}">Stars: ${collected} / ${TOTAL_STARS}${perfect ? ' - perfect!' : ''}</p>
      <button class="primary" data-action="title">Main menu</button>
      <button data-action="start" data-level="0">Play again from level 1</button>
    </div>`
}

const SCREENS: Partial<Record<game.Screen, () => string>> = {
  start: startScreen,
  title: titleScreen,
  paused: pausedScreen,
  complete: completeScreen,
  victory: victoryScreen,
}

// ---------- mounting and updating

const el = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!

export function mountOverlay(root: HTMLElement) {
  // HUD buttons have tabindex=-1 and are never focused, otherwise Space (jump) would press them
  root.innerHTML = `
    <div class="vignette"></div>
    <div class="fade"></div>
    <div class="hud" hidden>
      <div class="hud-box" data-id="level"></div>
      <div class="hud-box"><span data-id="time"></span> <span class="skull">x</span><span data-id="deaths"></span></div>
      <div class="hud-box" data-id="stars"></div>
      <div class="hud-buttons">
        <button class="icon" tabindex="-1" data-action="mute" data-id="mute" title="Mute (M)"></button>
        <button class="icon" tabindex="-1" data-action="pause" title="Pause (Esc)">||</button>
      </div>
    </div>
    <div class="hint hidden"></div>
    <div class="touch-controls">
      <div class="touch-move">
        <div class="touch-button" data-touch="left">&#9664;</div>
        <div class="touch-button" data-touch="right">&#9654;</div>
      </div>
      <div class="touch-button jump" data-touch="jump">JUMP</div>
    </div>
    <div class="screen"></div>
    <div class="rotate">Plays best sideways (turn off rotation lock)</div>`

  const hud = el('.hud', root)
  const hint = el('.hint', root)
  const screenEl = el('.screen', root)
  const field = (id: string) => el(`[data-id="${id}"]`, hud)

  let shownScreen: game.Screen | null = null
  let shownRun = ''
  let shownMuted = state.muted
  let lastStars = ''
  let hintTimer = 0

  function render() {
    const run = `${state.level}-${state.attempt}`
    if (run !== shownRun) {
      shownRun = run
      // replay the black fade every time a level (re)starts
      const fade = el('.fade', root)
      fade.replaceWith(fade.cloneNode())
      const { name, hint: text } = LEVELS[state.level]
      field('level').textContent = `Level ${state.level + 1}/${LEVELS.length} · ${name}`
      hint.textContent = text ?? ''
      hint.classList.toggle('hidden', !text)
      clearTimeout(hintTimer)
      hintTimer = setTimeout(() => hint.classList.add('hidden'), 4500)
    }

    // CSS shows the touch buttons only while playing, on touch screens
    root.dataset.screen = state.screen
    setTouchEnabled(state.screen === 'playing')
    hud.hidden = state.screen === 'start' || state.screen === 'title'
    if (state.screen !== 'playing') hint.classList.add('hidden')
    field('time').textContent = formatTime(state.time)
    field('deaths').textContent = String(state.deaths)
    field('mute').textContent = soundLabel()
    const stars = state.runStars.join()
    if (stars !== lastStars || field('stars').childElementCount === 0) {
      lastStars = stars
      field('stars').innerHTML = starRow(state.runStars, LEVELS[state.level].stars.length, 16)
    }

    // the title screen also shows the sound setting, so it's redrawn when that changes
    const mutedChanged = shownMuted !== state.muted && state.screen === 'title'
    shownMuted = state.muted
    if (state.screen !== shownScreen || mutedChanged) {
      shownScreen = state.screen
      screenEl.innerHTML = SCREENS[state.screen]?.() ?? ''
      el<HTMLButtonElement>('button.primary', screenEl)?.focus()
    }
  }

  root.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')
    if (!button || button.disabled) return
    switch (button.dataset.action) {
      case 'start': return game.startLevel(Number(button.dataset.level))
      case 'next': return game.nextLevel()
      case 'restart': return game.restart()
      case 'pause': return game.togglePause()
      case 'title': return game.toTitle()
      case 'mute': return game.toggleMute()
    }
  })
  // keep HUD buttons from taking focus when clicked
  hud.addEventListener('mousedown', (e) => e.preventDefault())

  // the start screen goes to the menu on any key, click or tap
  window.addEventListener('click', () => {
    if (state.screen === 'start') game.openMenu()
  })

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    const { screen } = state
    if (screen === 'start') {
      // modifier keys alone (like Alt+Tab or a screenshot shortcut) don't count
      if (!['Alt', 'Control', 'Meta', 'Shift', 'Tab'].includes(e.key)) game.openMenu()
      return
    }
    if (e.code === 'Escape' || e.code === 'KeyP') game.togglePause()
    else if (e.code === 'KeyM') game.toggleMute()
    else if (e.code === 'KeyR' && (screen === 'playing' || screen === 'paused')) game.restart()
    // focused buttons handle Enter themselves
    else if (e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      if (screen === 'title') game.startLevel(state.unlocked)
      else if (screen === 'complete') game.nextLevel()
      else if (screen === 'victory') game.toTitle()
    }
  })

  game.subscribe(render)
  render()
}
