// Ghost of your best run: the inputs of each physics step are recorded during a run, the run with
// the best time is saved, and the next attempts replay it in a second simulation alongside you.
// The physics is deterministic, so the same inputs on the same steps make exactly the same run.

import type { InputState } from './input.js'
import type { Level } from './levels.js'
import { LevelSim, type SimEvent } from './sim.js'

// one code per step: which inputs were held, and whether the player respawned just before it
const LEFT = 1
const RIGHT = 2
const JUMP = 4
const RESPAWN = 8

const storageKey = (level: Level) => `square-up:ghost:${level.name}`

/** Records a run, compressed as [code, how many steps in a row] pairs. */
export class GhostRecorder {
  private runs: number[] = []
  private respawned = false

  /** The level will respawn the player before the next step. */
  markRespawn() {
    this.respawned = true
  }

  record(input: InputState) {
    const code = (input.left ? LEFT : 0) | (input.right ? RIGHT : 0) | (input.jump ? JUMP : 0) | (this.respawned ? RESPAWN : 0)
    this.respawned = false
    const n = this.runs.length
    if (n > 0 && this.runs[n - 2] === code) this.runs[n - 1]++
    else this.runs.push(code, 1)
  }

  /** Short text for localStorage, like "0.3k,2.1c,6.9": code.count pairs, counts in base 36. */
  encode() {
    const parts: string[] = []
    for (let i = 0; i < this.runs.length; i += 2) parts.push(`${this.runs[i].toString(16)}.${this.runs[i + 1].toString(36)}`)
    return parts.join(',')
  }
}

export function saveGhost(level: Level, data: string) {
  localStorage.setItem(storageKey(level), data)
}

function loadGhost(level: Level): Uint8Array | null {
  const data = localStorage.getItem(storageKey(level))
  if (!data) return null
  const codes: number[] = []
  for (const part of data.split(',')) {
    const [code, count] = part.split('.')
    const c = parseInt(code, 16)
    const n = parseInt(count, 36)
    if (!(c >= 0 && c < 16 && n > 0)) return null // damaged: no ghost rather than a wrong one
    for (let i = 0; i < n; i++) codes.push(c)
  }
  return Uint8Array.from(codes)
}

/** Replays a saved run in its own simulation, one step for each of the player's steps. */
export class GhostRun {
  readonly sim: LevelSim
  private next = 0
  private readonly input: InputState = { left: false, right: false, jump: false }
  private readonly events: SimEvent[] = []

  private constructor(level: Level, private readonly codes: Uint8Array) {
    this.sim = new LevelSim(level)
  }

  /** The saved ghost for this level, if there is one. */
  static load(level: Level) {
    const codes = loadGhost(level)
    return codes ? new GhostRun(level, codes) : null
  }

  /** Still running: false once the recording is used up or the ghost reached the goal. */
  get running() {
    return this.next < this.codes.length && !this.sim.won
  }

  step() {
    if (!this.running) return
    const code = this.codes[this.next++]
    if (code & RESPAWN) this.sim.respawn()
    this.input.left = (code & LEFT) !== 0
    this.input.right = (code & RIGHT) !== 0
    this.input.jump = (code & JUMP) !== 0
    this.events.length = 0
    this.sim.step(this.input, this.events)
  }
}
