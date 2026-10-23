// Headless beatability check: beam-searches a route through each level using the real sim,
// once along the main path and once collecting every star.
//   make check-levels                         all levels
//   make check-levels ARGS=3                  only level 3
//   make check-levels ARGS="5 --timing"       start after 0..7.5s of standing still, to see how long
//                                             the worst moment to arrive makes you wait
// Runs under node (the only part of the project that does). tools/lib-resolve.ts points the
// bare 'p2-es' import at lib/, the same job the import map in index.html does for the browser.
import { LEVELS } from '../src/game/levels.js'
import { LevelSim, STEP as STEP_SECONDS, type SimEvent } from '../src/game/sim.js'

declare const process: { argv: string[]; exit(code: number): never }

/** Platform index to land on, or `s<i>` for star i. The goal is always the final target. */
type Waypoint = number | `s${number}`

const ACTIONS = [-1, 0, 1].flatMap((dir) => [false, true].map((jump) => ({ left: dir < 0, right: dir > 0, jump })))
// physics steps per decision: 12 = a new input every 0.1s and every key press lasts >= 100ms,
// roughly what a person can manage (a frame-perfect bot would prove much less)
const CHUNK = 12

function solve(li: number, route: Waypoint[], idle = 0, beam = 400, maxIter = 1500) {
  const sim = new LevelSim(LEVELS[li])
  for (let i = 0; i < Math.round(idle / STEP_SECONDS); i++) sim.step({ left: false, right: false, jump: false }, [])
  const startTime = sim.time
  const goal = sim.platformBodies.at(-1)!
  const reached = (w: Waypoint) =>
    typeof w === 'number' ? sim['ground'] === sim.platformBodies[w] : sim.stars[Number(w.slice(1))]
  const targetPos = (w: Waypoint | undefined): [number, number, number] => {
    if (typeof w === 'string') return [...LEVELS[li].stars[Number(w.slice(1))], 0]
    const body = w === undefined ? goal : sim.platformBodies[w]
    const box = body.shapes[0] as unknown as { width: number; height: number }
    return [body.position[0], body.position[1] + box.height / 2 + 0.5, box.width / 2]
  }

  let states = [{ s: sim.saveState(), stage: 0, score: 0 }]
  const events: SimEvent[] = []
  for (let it = 0; it < maxIter; it++) {
    const next = new Map<string, (typeof states)[number]>()
    for (const st of states) {
      for (const a of ACTIONS) {
        sim.loadState(st.s)
        let stage = st.stage
        for (let k = 0; k < CHUNK; k++) {
          events.length = 0
          sim.step(a, events)
          if (!sim.alive || sim.won) break
          while (stage < route.length && reached(route[stage])) stage++
        }
        if (sim.won && stage === route.length)
          return { ok: true, time: (sim.time - startTime).toFixed(1), stars: sim.stars.map(Number).join("") }
        if (!sim.alive || sim.won) continue
        const [tx, ty, halfW] = targetPos(route[stage])
        const [x, y] = sim.player.position
        const dist = Math.max(0, Math.abs(x - tx) - halfW) + Math.abs(y - ty) * 1.5
        const score = stage * 1000 - dist
        const key = `${stage}:${Math.round(x * 2)}:${Math.round(y * 2)}:${Math.sign(Math.round(sim.player.velocity[1]))}:${sim.grounded}`
        const prev = next.get(key)
        if (!prev || prev.score < score) next.set(key, { s: sim.saveState(), stage, score })
      }
    }
    states = [...next.values()].sort((a, b) => b.score - a.score).slice(0, beam)
    if (!states.length) return { ok: false, why: 'every path died' }
  }
  const best = states[0]
  return { ok: false, why: `stuck before ${String(route[best.stage] ?? 'goal')} at ${best.s.p.slice(0, 2).map((v) => v.toFixed(1))}` }
}

const ROUTES: { main: Waypoint[]; stars: Waypoint[] }[] = [
  { main: [1, 2, 3, 4], stars: [1, 's0', 2, 's1', 3, 4, 's2'] },
  {
    main: [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    stars: [1, 3, 's0', 1, 3, 4, 's1', 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 's2'],
  },
  {
    main: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    stars: [1, 's0', 2, 's1', 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 's2'],
  },
  {
    main: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13],
    stars: [1, 2, 3, 's0', 4, 5, 6, 7, 8, 's1', 9, 's2', 10, 12, 13],
  },
  {
    main: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    stars: [1, 's0', 2, 3, 4, 5, 6, 7, 8, 9, 's1', 10, 11, 12, 13, 14, 's2'],
  },
]

const only = process.argv.slice(2).find((a) => !a.startsWith('--'))
let failed = false
if (process.argv.includes('--timing')) {
  for (let i = 0; i < LEVELS.length; i++) {
    if (only !== undefined && Number(only) !== i + 1) continue
    const times: number[] = []
    for (let idle = 0; idle < 8; idle += 0.5) {
      const r = solve(i, ROUTES[i].main, idle)
      times.push(r.ok ? Number(r.time) : Infinity)
    }
    const best = Math.min(...times)
    console.log(`${i + 1} ${LEVELS[i].name.padEnd(12)} fastest ${best}s, worst ${Math.max(...times)}s (extra waiting: up to ${(Math.max(...times) - best).toFixed(1)}s)`)
  }
  process.exit(0)
}
for (let i = 0; i < LEVELS.length; i++) {
  if (only !== undefined && Number(only) !== i + 1) continue
  for (const kind of ['main', 'stars'] as const) {
    const result = solve(i, ROUTES[i][kind])
    failed ||= !result.ok
    console.log(`${i + 1} ${LEVELS[i].name.padEnd(12)} ${kind.padEnd(5)} ${JSON.stringify(result)}`)
  }
}
process.exit(failed ? 1 : 0)
