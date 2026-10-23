// World units: 1 unit = 1 tile = 16 pixels. Rects are { x, y } bottom-left corner + size.
// Player jump reaches ~3.2 tiles high and ~6 tiles far; a spring launches ~7.5 tiles high.
// Every level must stay beatable (with and without all stars): run `make check-levels`.

export type Rect = { x: number; y: number; w: number; h: number }

export type Movement = {
  /** Offset from the start position to the end point. */
  to: [number, number]
  /** Tiles per second going to the end point. */
  speed: number
  /** Tiles per second coming back (defaults to speed). */
  returnSpeed?: number
  /** Seconds to wait at each end. */
  pause?: number
  /** Start progress, 0..1 (used to put things off sync). */
  phase?: number
  /** Only moves once the player stands on it, then returns and waits again. */
  trigger?: boolean
}

export type Platform = Rect & {
  move?: Movement
  style?: 'grass' | 'stone'
  /** Shakes when stood on, falls away, then comes back a bit later. */
  crumble?: boolean
}
export type Hazard = Rect & { kind: 'spikes' | 'pillar' }

/** Spinning saw blade: either patrols along `move` or circles around (x, y) with `orbit`. */
export type Saw = {
  x: number
  y: number
  r?: number
  move?: Movement
  orbit?: { radius: number; speed: number; phase?: number }
}

export type Theme = {
  skyTop: string
  skyBottom: string
  hills: string
  hillsFar: string
  mountains: string
  clouds?: string
  night?: boolean
}

export type Level = {
  name: string
  hint?: string
  width: number
  height: number
  start: [number, number]
  platforms: Platform[]
  hazards: Hazard[]
  saws?: Saw[]
  /** Bottom-left corner of a 1x0.5 spring, placed on top of a platform. */
  springs?: [number, number][]
  /** Optional collectibles, always 3 per level. Center points. */
  stars: [number, number][]
  /** Flag base positions; touching one makes it the respawn point. */
  checkpoints?: [number, number][]
  goal: Rect
  theme: Theme
}

export const LEVELS: Level[] = [
  {
    name: 'First Steps',
    hint: 'Stand on the arrow platform - it zooms! Stars are optional.',
    width: 48,
    height: 20,
    start: [2, 3.5],
    theme: {
      skyTop: '#5fcde4',
      skyBottom: '#cbf1f5',
      hills: '#6abe30',
      hillsFar: '#99e550',
      mountains: '#a5d9e0',
    },
    platforms: [
      { x: 0, y: 0, w: 5, h: 3, style: 'grass' },
      { x: 8, y: 3, w: 4, h: 1 },
      // speeds up (3x) on the way out, slowly comes back
      { x: 15, y: 3, w: 3, h: 1, move: { to: [18, 0], speed: 9, returnSpeed: 3, pause: 1, trigger: true } },
      { x: 39, y: 4, w: 3, h: 1 },
      // elevator up to the goal
      { x: 44, y: 4, w: 3, h: 1, move: { to: [0, 9], speed: 2.5, pause: 1 } },
    ],
    hazards: [{ x: 5, y: 0, w: 43, h: 0.5, kind: 'spikes' }],
    stars: [
      [13.5, 7.5], // full jump over the first gap
      [26, 7.2], // jump while zooming
      [45.5, 17.3], // jump off the top of the elevator
    ],
    goal: { x: 37, y: 14, w: 4, h: 1 },
  },
  {
    name: 'The Climb',
    hint: 'Cracked platforms crumble. Springs bounce!',
    width: 30,
    height: 42,
    start: [13, 2.5],
    theme: {
      skyTop: '#306082',
      skyBottom: '#9badb7',
      hills: '#4b692f',
      hillsFar: '#6a8a4a',
      mountains: '#7f97a8',
    },
    platforms: [
      { x: 9, y: 0, w: 9, h: 2, style: 'grass' },
      { x: 3, y: 3, w: 4, h: 1 },
      { x: 3, y: 4, w: 1, h: 1, style: 'stone' },
      { x: 0, y: 5.5, w: 2, h: 1, crumble: true },
      { x: 5, y: 8, w: 3, h: 1 },
      { x: 12, y: 8, w: 4, h: 1 },
      { x: 19.5, y: 8, w: 3, h: 1 },
      // long elevator on the right
      { x: 25.5, y: 8, w: 3, h: 1, move: { to: [0, 12], speed: 3.5, pause: 1 } },
      { x: 21, y: 21, w: 3, h: 1 },
      { x: 14, y: 22.5, w: 5, h: 1 },
      { x: 9, y: 23, w: 2.5, h: 1, move: { to: [-5, 0], speed: 3.5, pause: 0.6 } },
      { x: 0, y: 25, w: 2, h: 1 },
      { x: 4.5, y: 27.5, w: 1.5, h: 1, crumble: true },
      { x: 0.5, y: 30, w: 1.5, h: 1 },
      { x: 4, y: 32.5, w: 3, h: 1 },
      { x: 10, y: 34, w: 4, h: 1 },
      { x: 17.5, y: 34, w: 1.5, h: 1, crumble: true },
      { x: 21, y: 34, w: 1.5, h: 1 },
      { x: 24.5, y: 34.5, w: 1.5, h: 1, crumble: true },
    ],
    hazards: [
      { x: 13.5, y: 9, w: 1, h: 0.5, kind: 'spikes' },
      { x: 16, y: 23.5, w: 1, h: 0.5, kind: 'spikes' },
    ],
    springs: [[5, 9]],
    stars: [
      [1, 9.6], // jump up from the crumbling ledge, then get off it in time
      [5.5, 16.6], // ride the spring
      [25.3, 38.4], // straight up from the last crumbling block, then drift onto the goal
    ],
    goal: { x: 27, y: 36, w: 3, h: 1 },
  },
  {
    name: 'Shuttle Run',
    hint: 'Watch out for saws. Time your jumps.',
    width: 56,
    height: 20,
    start: [1.5, 10.5],
    theme: {
      skyTop: '#d77bba',
      skyBottom: '#fbd6a0',
      hills: '#8f563b',
      hillsFar: '#d9a066',
      mountains: '#e8a9a0',
    },
    platforms: [
      { x: 0, y: 0, w: 3, h: 10, style: 'stone' },
      { x: 6, y: 9, w: 3, h: 1, move: { to: [6, 0], speed: 3.5, pause: 0.3 } },
      // waits underneath until you drop onto it, then shuttles you across
      { x: 12, y: 5, w: 3, h: 1, move: { to: [14, 0], speed: 4.5, returnSpeed: 5, pause: 1.5, trigger: true } },
      // safe ledge to wait for the elevator on
      { x: 29.5, y: 5, w: 2.5, h: 1 },
      { x: 33, y: 5, w: 3, h: 1, move: { to: [0, 8], speed: 3, pause: 0.8 } },
      { x: 37, y: 14, w: 1.5, h: 1 },
      { x: 41, y: 15, w: 1.5, h: 1, crumble: true },
      { x: 44.5, y: 13, w: 1.5, h: 1 },
      { x: 48, y: 11.5, w: 1.5, h: 1 },
      { x: 52, y: 9.5, w: 1.5, h: 1, crumble: true },
      { x: 48.5, y: 7.5, w: 1.5, h: 1 },
      { x: 52.5, y: 5, w: 3.5, h: 0.6, style: 'stone' },
      { x: 47, y: 3, w: 1.5, h: 1 },
    ],
    hazards: [{ x: 3, y: 0, w: 49, h: 0.5, kind: 'spikes' }],
    saws: [
      { x: 4.5, y: 7, move: { to: [0, 6], speed: 3, pause: 0.2 } },
      { x: 16, y: 8.6, move: { to: [8, 0], speed: 2.5, pause: 0.3 } },
      { x: 45.25, y: 15.2, orbit: { radius: 1.6, speed: 2.2 } },
    ],
    stars: [
      [13, 13.3], // jump off the moving platform at the right moment
      [22, 8.7], // dodge the saw while riding the shuttle
      [50.3, 3.3], // low dive towards the goal
    ],
    goal: { x: 52, y: 0, w: 4, h: 1.5 },
  },
  {
    name: 'The Wall',
    hint: "Don't touch the striped wall. Go under it.",
    width: 50,
    height: 22,
    start: [21, 18.5],
    theme: {
      skyTop: '#222034',
      skyBottom: '#45283c',
      hills: '#3f3f74',
      hillsFar: '#5b6ee1',
      mountains: '#4a3d6b',
      clouds: '#5a4a6e',
      night: true,
    },
    platforms: [
      { x: 18, y: 17, w: 6.5, h: 1 },
      { x: 13, y: 17, w: 1.5, h: 1 },
      { x: 8, y: 16, w: 1.5, h: 1, crumble: true },
      { x: 3.5, y: 17, w: 1.5, h: 1 },
      { x: 1, y: 13.5, w: 1.5, h: 1 },
      { x: 4.5, y: 10, w: 1.5, h: 1, crumble: true },
      { x: 8.5, y: 8, w: 1.5, h: 1 },
      { x: 12, y: 5.5, w: 1.5, h: 1 },
      // ferry under the wall: waits for you, then carries you across
      { x: 15, y: 1, w: 3, h: 1, move: { to: [20, 0], speed: 4.5, returnSpeed: 6, pause: 1.2, trigger: true } },
      { x: 39.5, y: 3.5, w: 3, h: 1 },
      { x: 36, y: 6, w: 2, h: 1, move: { to: [0, 6], speed: 2.2, pause: 1 } },
      { x: 32.5, y: 11, w: 1.5, h: 1 },
      { x: 40, y: 14, w: 1.5, h: 1 },
      { x: 43.5, y: 16, w: 1.5, h: 1, crumble: true },
    ],
    hazards: [
      { x: 25, y: 5, w: 2, h: 17, kind: 'pillar' },
      { x: 0, y: 0, w: 50, h: 0.5, kind: 'spikes' },
    ],
    saws: [
      { x: 2, y: 12, move: { to: [7, 0], speed: 3, pause: 0.3 } },
      { x: 40, y: 10, move: { to: [4.5, 0], speed: 3, pause: 0.2 } },
      { x: 42, y: 16.8, orbit: { radius: 1.7, speed: 2.4 } },
    ],
    springs: [[41.5, 4.5]],
    checkpoints: [[40.2, 4.5]],
    stars: [
      [1.5, 20.6], // high jump to the top-left corner
      [26, 3.6], // a short hop under the wall - a full jump touches it!
      [42, 12.3], // spring past the saw
    ],
    goal: { x: 47, y: 17.5, w: 3, h: 1 },
  },
  {
    name: 'Gauntlet',
    hint: 'Everything at once. Good luck!',
    width: 62,
    height: 24,
    start: [1.5, 19.5],
    theme: {
      skyTop: '#0b0b1e',
      skyBottom: '#3b1f4a',
      hills: '#2a1a3a',
      hillsFar: '#76428a',
      mountains: '#4a2a5a',
      clouds: '#3f2a55',
      night: true,
    },
    platforms: [
      { x: 0, y: 18, w: 3, h: 1, style: 'stone' },
      { x: 0, y: 14, w: 5, h: 1, style: 'stone' },
      { x: 5, y: 13, w: 2, h: 1 },
      { x: 9, y: 11.5, w: 1.5, h: 1, crumble: true },
      { x: 5.5, y: 9, w: 1.5, h: 1, crumble: true },
      { x: 10, y: 6.5, w: 1.5, h: 1 },
      // ferry under the first pillar
      { x: 11, y: 1, w: 2.5, h: 1, move: { to: [8, 0], speed: 5, pause: 0.5 } },
      { x: 21.5, y: 1, w: 2, h: 1 },
      // section 2: lifts, slightly off sync
      { x: 24.5, y: 1, w: 2, h: 1, move: { to: [0, 13], speed: 4, pause: 0.5, phase: 0 } },
      { x: 28.5, y: 1, w: 2, h: 1, move: { to: [0, 13], speed: 4, pause: 0.5, phase: 0.15 } },
      { x: 32.5, y: 1, w: 2, h: 1, move: { to: [0, 13], speed: 4, pause: 0.5, phase: 0.3 } },
      // over the second pillar: waits for you, then ferries you across
      { x: 35, y: 16, w: 2.5, h: 1, move: { to: [9, 0], speed: 4, pause: 1, trigger: true } },
      { x: 48.5, y: 14, w: 1.5, h: 1 },
      { x: 52, y: 11, w: 1.5, h: 1, crumble: true },
      { x: 55.5, y: 8, w: 1.5, h: 1 },
      // decorative perches from the sketch
      { x: 27, y: 20, w: 1.2, h: 0.8, style: 'stone' },
      { x: 31, y: 21, w: 1.2, h: 0.8, style: 'stone' },
    ],
    hazards: [
      { x: 16, y: 4, w: 2, h: 20, kind: 'pillar' },
      { x: 37.5, y: 0, w: 2.5, h: 15, kind: 'pillar' },
      { x: 0, y: 0, w: 37.5, h: 0.5, kind: 'spikes' },
      { x: 40, y: 0, w: 17, h: 0.5, kind: 'spikes' },
    ],
    saws: [
      { x: 8, y: 11, orbit: { radius: 1.6, speed: 2 } },
      { x: 24, y: 16.8, move: { to: [11, 0], speed: 3, pause: 0.3 } },
      { x: 60, y: 7.5, orbit: { radius: 1.4, speed: 2.5 } },
    ],
    springs: [[3.8, 15]],
    checkpoints: [[22.5, 2]],
    stars: [
      [4.3, 22.3], // take the spring on the lower ledge
      [29.5, 18.4], // jump off a lift under the patrolling saw
      [60, 7.5], // through the orbiting saw on the way down
    ],
    goal: { x: 57, y: 0, w: 5, h: 1.5 },
  },
]
