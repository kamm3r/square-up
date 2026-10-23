import { playSfx, startMusic } from '../game/audio.js'
import { setPlaying } from '../game/input.js'
import { LEVELS } from '../game/levels.js'
import * as game from '../game/store.js'
import { countStars, state } from '../game/store.js'
import { changeSetting, onSettingsChange, settings, VOLUME_STEPS } from '../game/settings.js'

// The overlay is plain HTML on top of the canvas. Screens are rebuilt from template strings
// when they change; values that tick every frame (time, stars) are patched in place.
// Buttons say what they do with data-action, handled by one click listener at the bottom.

const formatTime = (t: number) => {
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

// ---------- title menus: the logo over the level, then a short pixel menu where a pixel arrow
// points at the selected item

const VERSION = 'v1.1'

/** Pixel arrow pointing at the selected item: o = outline, y = yellow. */
const ARROW_ROWS = ['oo.....', 'oyo....', 'oyyo...', 'oyyyo..', 'oyyyyo.', 'oyyyo..', 'oyyo...', 'oyo....', 'oo.....']
const ARROW_RECTS = ARROW_ROWS.flatMap((row, y) =>
  [...row].map((c, x) => (c === '.' ? '' : `<rect x="${x}" y="${y}" width="1" height="1" class="${c}"/>`)),
).join('')

/** The menu cursor, shown only on the selected item. */
const CURSOR = `<svg class="cursor" viewBox="0 0 7 9" width="14" height="18" shape-rendering="crispEdges">${ARROW_RECTS}</svg>`

function menuItem(label: string, attrs: string, cls = '') {
  return `<button class="menu-item ${cls}" ${attrs}>${CURSOR}<span class="label">${label}</span></button>`
}

/** An item that opens another menu. */
const menuLink = (label: string, screen: game.MenuScreen, cls = '') => menuItem(label, `data-action="menu" data-menu="${screen}"`, cls)

const BACK = menuItem('Back', 'data-action="back"', 'back')

/** A titled sub-menu page over the darkened level. */
const menuPage = (title: string, body: string) => `
  <div class="menu-shade full"></div>
  <div class="menu-screen">
    <h2 class="menu-title">${title}</h2>
    ${body}
  </div>`

function titleScreen() {
  const { unlocked } = state
  return `
    <div class="menu-shade"></div>
    <div class="menu-screen">
      <h1 class="logo">SQUARE<span>UP</span></h1>
      <p class="tagline">a tiny platformer in ${LEVELS.length} levels</p>
      <nav class="menu">
        ${menuItem(unlocked > 0 ? `Continue <small>level ${unlocked + 1}</small>` : 'Start Game', `data-action="start" data-level="${unlocked}"`)}
        ${menuLink('Level Select', 'levels')}
        ${menuLink('Settings', 'settings')}
      </nav>
    </div>
    <div class="corner left">${VERSION}</div>
    <div class="corner right">${starIcon(true, 14)} ${countStars(state.stars)} / ${TOTAL_STARS}</div>`
}

function levelsScreen() {
  const { unlocked, best, stars } = state
  const rows = LEVELS.map((l, i) => {
    const locked = i > unlocked
    const label = `
      <span class="num">${i + 1}</span>
      <span class="name">${locked ? 'locked' : l.name}</span>
      ${starRow(stars[i] ?? [], l.stars.length, 12)}
      <span class="time">${locked ? '' : best[i] ? formatTime(best[i].time) : '--'}</span>`
    return menuItem(label, `data-action="start" data-level="${i}" ${locked ? 'disabled' : ''}`, 'level-row')
  }).join('')
  return menuPage('Level Select', `<nav class="menu">${rows}${BACK}</nav>`)
}

// ---------- settings: a list of sections, like a console game's options menu

const settingsScreen = () =>
  menuPage(
    'Settings',
    `<nav class="menu">
      ${menuLink('Game', 'settings-game')}
      ${menuLink('Audio', 'settings-audio')}
      ${menuLink('Video', 'settings-video')}
      ${menuLink('Controller', 'settings-controller')}
      ${menuLink('Keyboard', 'settings-keyboard', 'keys-only')}
      ${menuLink('Touch', 'settings-keyboard', 'touch-only')}
      ${menuItem('Back', 'data-action="back"', 'back far')}
    </nav>`,
  )

/** A volume as a row of pixel blocks. */
const volumeBar = (value: number) =>
  `<span class="bar">${Array.from({ length: VOLUME_STEPS }, (_, i) => `<i${i < value ? ' class="on"' : ''}></i>`).join('')}</span>`

const onOff = (on: boolean) => (on ? 'On' : 'Off')

/** A setting you can change: its name on the left, its value on the right. */
const settingRow = (name: string, value: string, attrs: string) =>
  menuItem(`<span class="name">${name}</span><span class="value">${value}</span>`, attrs, 'setting-row')

const setting = (name: string, key: string, value: string) => settingRow(name, value, `data-action="setting" data-key="${key}"`)

/** A page of settings, rebuilt in place when one changes (see redrawSettings). */
const settingsPage = (title: string, rows: string) =>
  menuPage(title, `<nav class="menu">${rows}${BACK}</nav><p class="menu-hint keys-only">&larr; &rarr; to change</p>`)

const SETTING_PAGES: Partial<Record<game.Screen, () => string>> = {
  'settings-game': () =>
    settingsPage('Game', setting('Screen shake', 'shake', onOff(settings.shake)) + setting('Best-run ghost', 'ghost', onOff(settings.ghost))),
  'settings-audio': () =>
    settingsPage(
      'Audio',
      settingRow('Sound', onOff(!state.muted), 'data-action="mute"') +
        setting('Music', 'music', volumeBar(settings.music)) +
        setting('Effects', 'sfx', volumeBar(settings.sfx)),
    ),
  'settings-video': () =>
    settingsPage(
      'Video',
      (document.fullscreenEnabled ? setting('Fullscreen', 'fullscreen', onOff(!!document.fullscreenElement)) : '') +
        setting('FPS counter', 'fps', onOff(settings.fps)),
    ),
}

/** Change a setting by one step: dir -1 or +1 (arrow keys), or 0 to cycle (click, tap, Enter). */
function adjustSetting(key: string | undefined, dir: number) {
  if (key === 'music' || key === 'sfx') {
    const value = settings[key]
    const next = dir === 0 ? (value + 1) % (VOLUME_STEPS + 1) : Math.min(VOLUME_STEPS, Math.max(0, value + dir))
    changeSetting(key, next)
    if (key === 'sfx') playSfx('tap', 0.5) // hear the new volume
  } else if (key === 'shake' || key === 'ghost' || key === 'fps') {
    changeSetting(key, !settings[key])
  } else if (key === 'fullscreen') {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }
}

/** What each button or key does: one row per action. */
const bindings = (rows: [string, string][]) =>
  `<div class="bindings">${rows.map(([what, how]) => `<div><span class="name">${what}</span><span class="value">${how}</span></div>`).join('')}</div>`

const controllerScreen = () =>
  menuPage(
    'Controller',
    bindings([
      ['Move', 'Stick / D-pad'],
      ['Jump', '<kbd>A</kbd> (hold for higher)'],
      ['Pause', '<kbd>Start</kbd>'],
      ['Restart', '<kbd>Back</kbd>'],
      ['Menus', '<kbd>A</kbd> choose, <kbd>B</kbd> back'],
    ]) + `<nav class="menu">${BACK}</nav>`,
  )

const keyboardScreen = () =>
  menuPage(
    '<span class="keys-only">Keyboard</span><span class="touch-only">Touch</span>',
    `<div class="keys-only">${bindings([
      ['Move', '<kbd>A</kbd><kbd>D</kbd> / <kbd>&larr;</kbd><kbd>&rarr;</kbd>'],
      ['Jump', '<kbd>Space</kbd> / <kbd>W</kbd> (hold for higher)'],
      ['Pause', '<kbd>Esc</kbd> / <kbd>P</kbd>'],
      ['Restart', '<kbd>R</kbd>'],
      ['Mute', '<kbd>M</kbd>'],
    ])}</div>
    <div class="touch-only">${bindings([
      ['Move', 'Left half: slide your thumb'],
      ['Jump', 'Right half (hold for higher)'],
      ['Pause', 'The || button'],
    ])}</div>
    <nav class="menu">${BACK}</nav>`,
  )

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
  title: titleScreen,
  levels: levelsScreen,
  settings: settingsScreen,
  ...SETTING_PAGES,
  'settings-controller': controllerScreen,
  'settings-keyboard': keyboardScreen,
  paused: pausedScreen,
  complete: completeScreen,
  victory: victoryScreen,
}

// ---------- mounting and updating

const el = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!

/** Buttons you can select, skipping ones hidden on this device (like Touch on a computer). */
const selectable = (root: ParentNode, selector = '.menu-item:not(:disabled), .panel button:not(:disabled)') =>
  [...root.querySelectorAll<HTMLButtonElement>(selector)].filter((b) => b.getClientRects().length > 0)

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
    setPlaying(state.screen === 'playing')
    hud.hidden = game.MENU_SCREENS.includes(state.screen)
    if (state.screen !== 'playing') hint.classList.add('hidden')
    field('time').textContent = formatTime(state.time)
    field('deaths').textContent = String(state.deaths)
    field('mute').textContent = soundLabel()
    const stars = state.runStars.join()
    if (stars !== lastStars || field('stars').childElementCount === 0) {
      lastStars = stars
      field('stars').innerHTML = starRow(state.runStars, LEVELS[state.level].stars.length, 16)
    }

    // the audio settings show the sound switch, so they're redrawn when that changes
    const mutedChanged = shownMuted !== state.muted
    shownMuted = state.muted
    if (mutedChanged && state.screen === shownScreen) redrawSettings()
    else if (state.screen !== shownScreen) {
      // coming back from a menu, select the item that opened it; otherwise the first item
      const from = shownScreen
      shownScreen = state.screen
      screenEl.innerHTML = SCREENS[state.screen]?.() ?? ''
      const opener = from ? selectable(screenEl, `[data-menu="${from}"]`)[0] : undefined
      ;(opener ?? screenEl.querySelector<HTMLButtonElement>('button.primary') ?? selectable(screenEl)[0])?.focus()
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
      case 'menu': return game.showMenu(button.dataset.menu as game.MenuScreen)
      case 'back': return game.backMenu()
      case 'setting': return adjustSetting(button.dataset.key, 0)
      case 'mute': return game.toggleMute()
    }
  })
  // keep HUD buttons from taking focus when clicked
  hud.addEventListener('mousedown', (e) => e.preventDefault())

  // the mouse selects what it points at, so keyboard and mouse share one marker
  screenEl.addEventListener('pointerover', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLButtonElement>('.menu-item')
    if (item && !item.disabled && e.pointerType === 'mouse') item.focus()
  })

  // browsers only allow sound after the first key or click, so start the music then
  const startMusicOnce = () => {
    if (game.MENU_SCREENS.includes(state.screen)) startMusic()
    window.removeEventListener('click', startMusicOnce)
    window.removeEventListener('keydown', startMusicOnce)
  }
  window.addEventListener('click', startMusicOnce)
  window.addEventListener('keydown', startMusicOnce)

  window.addEventListener('keydown', (e) => {
    const { screen } = state
    const focused = document.activeElement as HTMLElement | null
    const change = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }[e.code]
    if (change && focused?.dataset.action === 'setting') {
      adjustSetting(focused.dataset.key, change)
      e.preventDefault()
      return
    }
    // up and down move through the items of a menu or panel
    const step = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 }[e.code]
    if (step && screen !== 'playing' && screenEl.querySelector('.menu, .panel')) {
      const items = selectable(screenEl)
      const at = items.indexOf(document.activeElement as HTMLButtonElement)
      items[(at + step + items.length) % items.length]?.focus()
      e.preventDefault()
      return
    }
    if (e.repeat) return
    if (e.code === 'Escape' && game.MENU_SCREENS.includes(screen)) return game.backMenu()
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

  // redraw a settings page when a setting (or fullscreen) changes, keeping the same item selected
  const redrawSettings = () => {
    const page = SETTING_PAGES[state.screen]
    if (!page) return
    const key = (document.activeElement as HTMLElement | null)?.dataset.key
    // swap just the menu items, so the screen doesn't replay its fade-in on every change
    const fresh = document.createElement('div')
    fresh.innerHTML = page()
    screenEl.querySelector('.menu')?.replaceWith(fresh.querySelector('.menu')!)
    screenEl.querySelector<HTMLButtonElement>(key ? `[data-key="${key}"]` : '[data-action="mute"]')?.focus()
  }
  onSettingsChange(redrawSettings)
  document.addEventListener('fullscreenchange', redrawSettings)

  game.subscribe(render)
  render()
}
