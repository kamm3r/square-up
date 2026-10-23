export type Sfx = 'jump' | 'hurt' | 'power_up' | 'tap' | 'coin' | 'explosion'

const SFX: Sfx[] = ['jump', 'hurt', 'power_up', 'tap', 'coin', 'explosion']

let muted = localStorage.getItem('square-up:muted') === '1'
let music: HTMLAudioElement | null = null

// Sound effects go through Web Audio: each file is downloaded and decoded once, then every play
// is instant. (Copying <audio> elements instead makes iPhones fetch the file again every time.)
const context = new AudioContext()
const buffers = new Map<Sfx, AudioBuffer>()
for (const name of SFX) {
  fetch(`public/sfx/${name}.wav`)
    .then((r) => r.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => buffers.set(name, buffer))
    .catch(() => {})
}

export function playSfx(name: Sfx, volume = 0.5, rate = 1) {
  const buffer = buffers.get(name)
  if (muted || !buffer) return
  const source = context.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = rate
  const gain = context.createGain()
  gain.gain.value = volume
  source.connect(gain).connect(context.destination)
  source.start()
}

/** Browsers only allow audio after a user gesture, so call this from one. */
export function startMusic() {
  void context.resume().catch(() => {})
  if (!music) {
    music = new Audio('public/sfx/music.mp3')
    music.loop = true
    music.volume = 0.25
  }
  if (!muted) void music.play().catch(() => {})
}

export function isMuted() {
  return muted
}

export function setMuted(value: boolean) {
  muted = value
  localStorage.setItem('square-up:muted', value ? '1' : '0')
  if (muted) music?.pause()
  else startMusic()
}
