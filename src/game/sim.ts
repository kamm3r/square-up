import { Body, Box, World } from 'p2-es'
import type { Level, Movement, Platform, Rect, Saw } from './levels.js'
import type { InputState } from './input.js'

export const STEP = 1 / 120

export const PLAYER_SIZE = 0.85
const HALF = PLAYER_SIZE / 2

const GRAVITY = 45
const RUN_SPEED = 8
const ACCEL_GROUND = 90
const ACCEL_AIR = 55
/** With no key held in the air you keep drifting (so hopping on moving platforms works). */
const AIR_DRAG = 6
const JUMP_SPEED = 17
const JUMP_CUT = 0.5
const MAX_FALL = 24
const REST_OVERLAP = 0.005
const COYOTE_TIME = 0.1
const JUMP_BUFFER = 0.12
const HAZARD_GRACE = 0.12
const SPRING_SPEED = 26
const CRUMBLE_DELAY = 0.45
const CRUMBLE_RESPAWN = 2.5
const STAR_HALF = 0.4
export const SAW_RADIUS = 0.5

export type SimEvent = 'jump' | 'land' | 'die' | 'win' | 'star' | 'spring' | 'checkpoint' | 'crumble'

/** Progress 0..1 along a ping-pong path at time t (pure function, used by saws). */
function pathProgress(m: Movement, t: number) {
  const dist = Math.hypot(m.to[0], m.to[1])
  const tF = dist / m.speed
  const tB = dist / (m.returnSpeed ?? m.speed)
  const p = m.pause ?? 0
  const cycle = tF + p + tB + p
  const u = (((t + (m.phase ?? 0) * cycle) % cycle) + cycle) % cycle
  if (u < tF) return u / tF
  if (u < tF + p) return 1
  if (u < tF + p + tB) return 1 - (u - tF - p) / tB
  return 0
}

export function sawPosition(saw: Saw, t: number): [number, number] {
  if (saw.orbit) {
    const a = (saw.orbit.phase ?? 0) * Math.PI * 2 + saw.orbit.speed * t
    return [saw.x + Math.cos(a) * saw.orbit.radius, saw.y + Math.sin(a) * saw.orbit.radius]
  }
  if (saw.move) {
    const s = pathProgress(saw.move, t)
    return [saw.x + saw.move.to[0] * s, saw.y + saw.move.to[1] * s]
  }
  return [saw.x, saw.y]
}

class Mover {
  readonly body: Body
  private readonly from: [number, number]
  private readonly dist: number
  s = 0
  dir = 1
  wait = 0
  active = true
  prevX: number
  prevY: number

  constructor(body: Body, readonly move: Movement, readonly w: number, readonly h: number) {
    this.body = body
    this.from = [body.position[0], body.position[1]]
    this.dist = Math.hypot(move.to[0], move.to[1])
    this.prevX = body.position[0]
    this.prevY = body.position[1]
    this.reset()
  }

  reset() {
    this.s = this.move.phase ?? 0
    this.dir = 1
    this.wait = 0
    this.active = !this.move.trigger
    const [x, y] = this.at(this.s)
    this.body.position[0] = this.prevX = x
    this.body.position[1] = this.prevY = y
    this.body.velocity[0] = this.body.velocity[1] = 0
  }

  activate() {
    if (this.move.trigger && !this.active) {
      this.active = true
      this.wait = 0.15
    }
  }

  private at(s: number): [number, number] {
    return [this.from[0] + this.move.to[0] * s, this.from[1] + this.move.to[1] * s]
  }

  /** Set the velocity that will carry the body to its next path point during this step. */
  update(dt: number) {
    this.prevX = this.body.position[0]
    this.prevY = this.body.position[1]
    if (this.active) {
      if (this.wait > 0) {
        this.wait -= dt
      } else {
        const speed = this.dir > 0 ? this.move.speed : (this.move.returnSpeed ?? this.move.speed)
        this.s += (this.dir * speed * dt) / this.dist
        const pause = this.move.pause ?? 0
        if (this.s >= 1) {
          this.s = 1
          this.dir = -1
          this.wait = pause
        } else if (this.s <= 0) {
          this.s = 0
          this.dir = 1
          this.wait = pause
          if (this.move.trigger) this.active = false
        }
      }
    }
    const [x, y] = this.at(this.s)
    this.body.velocity[0] = (x - this.body.position[0]) / dt
    this.body.velocity[1] = (y - this.body.position[1]) / dt
  }
}

export class Crumble {
  state: 'solid' | 'shaking' | 'gone' = 'solid'
  timer = 0
  constructor(
    readonly body: Body,
    readonly rect: Rect,
    /** Index into level.platforms, for rendering. */
    readonly index: number,
  ) {}
}

const overlaps = (ax: number, ay: number, ahw: number, ahh: number, r: Rect, shrink = 0) =>
  Math.abs(ax - (r.x + r.w / 2)) < ahw + r.w / 2 - shrink &&
  Math.abs(ay - (r.y + r.h / 2)) < ahh + r.h / 2 - shrink

/** Physics + game rules for one level. Rendering reads from it; it knows nothing about three.js. */
export class LevelSim {
  readonly world: World
  readonly player: Body
  readonly movers: Mover[] = []
  readonly crumbles: Crumble[] = []
  /** Body per platform, in level order (goal last). */
  readonly platformBodies: Body[] = []
  private readonly moverByBody = new Map<Body, Mover>()
  private readonly crumbleByBody = new Map<Body, Crumble>()
  private readonly goalBody: Body

  prevX = 0
  prevY = 0
  facing = 1
  grounded = false
  /** How fast the player was falling when they last landed (for the squash effect). */
  landSpeed = 0
  alive = true
  won = false
  /** Seconds since the last (re)spawn; also drives saws. */
  time = 0
  /** Stars collected in this run (lost again on death unless a checkpoint banked them). */
  stars: boolean[]
  /** Which star the last 'star' event picked up. */
  lastStar = -1
  private bankedStars: boolean[]
  checkpoint = -1
  /** Sim time each spring last fired, for its bounce animation. */
  springTimes: number[]
  private ground: Body | null = null
  /** Horizontal speed relative to whatever we stand on, so platforms that change speed don't make us slide. */
  private runVx = 0
  private coyote = 0
  private buffer = 0
  private jumpHeld = false
  private jumping = false

  constructor(readonly level: Level) {
    this.world = new World({ gravity: [0, -GRAVITY] })
    const cm = this.world.defaultContactMaterial
    cm.friction = 0
    cm.restitution = 0
    cm.stiffness = 1e8
    cm.relaxation = 3

    level.platforms.forEach((p, i) => this.platformBodies.push(this.addPlatform(p, i)))
    this.goalBody = this.addPlatform(level.goal, -1)
    this.platformBodies.push(this.goalBody)

    // invisible side walls keep the player inside the map horizontally
    for (const x of [-0.5, level.width + 0.5]) {
      const wall = new Body({ mass: 0, position: [x, level.height] })
      wall.addShape(new Box({ width: 1, height: level.height * 4 }))
      this.world.addBody(wall)
    }

    this.player = new Body({ mass: 1, fixedRotation: true, position: [...level.start] })
    this.player.addShape(new Box({ width: PLAYER_SIZE, height: PLAYER_SIZE }))
    this.player.damping = 0
    this.world.addBody(this.player)

    this.stars = level.stars.map(() => false)
    this.bankedStars = [...this.stars]
    this.springTimes = (level.springs ?? []).map(() => -10)
    this.respawn()
  }

  private addPlatform(p: Platform | Rect, index: number): Body {
    const plat = p as Platform
    const body = new Body({
      mass: 0,
      type: plat.move ? Body.KINEMATIC : Body.STATIC,
      position: [p.x + p.w / 2, p.y + p.h / 2],
    })
    body.addShape(new Box({ width: p.w, height: p.h }))
    this.world.addBody(body)
    if (plat.move) {
      const mover = new Mover(body, plat.move, p.w, p.h)
      this.movers.push(mover)
      this.moverByBody.set(body, mover)
    } else if (plat.crumble) {
      const c = new Crumble(body, p, index)
      this.crumbles.push(c)
      this.crumbleByBody.set(body, c)
    }
    return body
  }

  get respawnPoint(): [number, number] {
    const cp = this.level.checkpoints?.[this.checkpoint]
    return cp ? [cp[0], cp[1] + HALF + 0.05] : this.level.start
  }

  /** Put the world back to its starting state and the player at the last checkpoint. */
  respawn() {
    for (const m of this.movers) m.reset()
    for (const c of this.crumbles) this.setCrumble(c, 'solid')
    const [x, y] = this.respawnPoint
    this.player.position[0] = this.prevX = x
    this.player.position[1] = this.prevY = y
    this.player.velocity[0] = this.player.velocity[1] = 0
    this.stars = [...this.bankedStars]
    this.facing = 1
    this.grounded = false
    this.ground = null
    this.runVx = 0
    this.alive = true
    this.won = false
    this.coyote = this.buffer = 0
    this.jumping = false
    this.time = 0
  }

  private setCrumble(c: Crumble, state: Crumble['state'], timer = 0) {
    const inWorld = this.world.bodies.includes(c.body)
    if (state === 'gone' && inWorld) this.world.removeBody(c.body)
    if (state !== 'gone' && !inWorld) this.world.addBody(c.body)
    c.state = state
    c.timer = timer
  }

  private updateCrumbles(dt: number) {
    for (const c of this.crumbles) {
      if (c.state === 'solid') continue
      c.timer -= dt
      if (c.timer > 0) continue
      if (c.state === 'shaking') this.setCrumble(c, 'gone', CRUMBLE_RESPAWN)
      // don't reappear inside the player
      else if (!overlaps(this.player.position[0], this.player.position[1], HALF, HALF, c.rect))
        this.setCrumble(c, 'solid')
    }
  }

  /** Advance one fixed step, pushing anything notable into `events`. */
  step(input: InputState, events: SimEvent[]) {
    const p = this.player
    this.prevX = p.position[0]
    this.prevY = p.position[1]
    this.time += STEP
    for (const m of this.movers) m.update(STEP)
    this.updateCrumbles(STEP)

    if (!this.alive || this.won) {
      // keep the world moving but freeze the player in place
      this.world.step(STEP)
      p.position[0] = this.prevX
      p.position[1] = this.prevY
      p.velocity[0] = p.velocity[1] = 0
      return
    }

    const gvx = this.ground ? this.ground.velocity[0] : 0
    const gvy = this.ground ? this.ground.velocity[1] : 0

    // horizontal movement, relative to whatever we stand on
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    if (dir !== 0) this.facing = dir
    const accel = this.grounded ? ACCEL_GROUND : dir === 0 ? AIR_DRAG : ACCEL_AIR
    const dv = dir * RUN_SPEED - this.runVx
    const maxDv = accel * STEP
    this.runVx += Math.max(-maxDv, Math.min(maxDv, dv))
    p.velocity[0] = gvx + this.runVx

    // ride platforms exactly: no sinking, no floating off, no hop when a lift stops
    if (this.grounded && !this.jumping) p.velocity[1] = gvy

    // jumping with coyote time, buffering and variable height
    this.coyote = this.grounded ? COYOTE_TIME : this.coyote - STEP
    if (input.jump && !this.jumpHeld) this.buffer = JUMP_BUFFER
    else this.buffer -= STEP
    if (this.buffer > 0 && this.coyote > 0) {
      p.velocity[1] = JUMP_SPEED + Math.max(0, gvy)
      this.buffer = this.coyote = 0
      this.jumping = true
      this.grounded = false
      this.ground = null
      events.push('jump')
    }
    if (!input.jump && this.jumping && p.velocity[1] > 0) {
      p.velocity[1] *= JUMP_CUT
      this.jumping = false
    }
    if (p.velocity[1] <= 0) this.jumping = false
    this.jumpHeld = input.jump
    if (p.velocity[1] < -MAX_FALL) p.velocity[1] = -MAX_FALL
    const vyBefore = p.velocity[1]
    const fallSpeed = gvy - vyBefore

    this.world.step(STEP)
    this.runVx = p.velocity[0] - gvx

    // ground check from this step's contacts
    const wasGrounded = this.grounded
    this.grounded = false
    this.ground = null
    for (const eq of this.world.narrowphase.contactEquations) {
      let ny: number
      let other: Body
      if (eq.bodyA === p) {
        ny = -eq.normalA[1]
        other = eq.bodyB
      } else if (eq.bodyB === p) {
        ny = eq.normalA[1]
        other = eq.bodyA
      } else continue
      // judged by the speed before the step: a hard landing sinks in, the physics pushes back
      // up, and that push must not count as leaving the ground (or it launches you off it)
      if (ny > 0.5 && vyBefore - other.velocity[1] < 0.5) {
        this.grounded = true
        this.ground = other
      }
    }
    if (this.ground) {
      // Put the player back on top of the ground. A fast fall sinks a little into it, and the
      // physics would push them back out with an upward kick: a small bounce and a second landing.
      // A hair of overlap stays (what the physics settles at by itself), because exactly touching
      // doesn't always count as a contact and the player would "land" over and over.
      const sink = this.ground.getAABB().upperBound[1] + HALF - REST_OVERLAP - p.position[1]
      if (sink > 0 && sink < 0.5) p.position[1] += sink
      p.velocity[1] = this.ground.velocity[1]
    }
    if (this.grounded && !wasGrounded) {
      this.landSpeed = fallSpeed
      events.push('land')
    }
    const newGvx = this.ground ? this.ground.velocity[0] : 0
    this.runVx += gvx - newGvx

    const x = p.position[0]
    const y = p.position[1]

    // springs launch you when you step or land on them
    this.level.springs?.forEach(([sx, sy], i) => {
      if (p.velocity[1] > 1 || !overlaps(x, y, HALF, HALF, { x: sx + 0.1, y: sy, w: 0.8, h: 0.5 })) return
      p.velocity[1] = SPRING_SPEED
      this.grounded = false
      this.ground = null
      this.jumping = false
      this.coyote = this.buffer = 0
      this.springTimes[i] = this.time
      events.push('spring')
    })

    if (this.ground) {
      this.moverByBody.get(this.ground)?.activate()
      const crumble = this.crumbleByBody.get(this.ground)
      if (crumble?.state === 'solid') {
        this.setCrumble(crumble, 'shaking', CRUMBLE_DELAY)
        events.push('crumble')
      }
      if (this.ground === this.goalBody) {
        this.won = true
        events.push('win')
        return
      }
    }

    this.level.stars.forEach(([sx, sy], i) => {
      if (this.stars[i]) return
      if (Math.abs(x - sx) < HALF + STAR_HALF && Math.abs(y - sy) < HALF + STAR_HALF) {
        this.stars[i] = true
        this.lastStar = i
        events.push('star')
      }
    })

    this.level.checkpoints?.forEach(([cx, cy], i) => {
      if (i <= this.checkpoint) return
      if (overlaps(x, y, HALF, HALF, { x: cx - 0.4, y: cy, w: 0.8, h: 2 })) {
        this.checkpoint = i
        this.bankedStars = [...this.stars]
        events.push('checkpoint')
      }
    })

    // hazards, saws and falling out of the map
    if (this.time > HAZARD_GRACE) {
      const hitHazard = this.level.hazards.some((h) => overlaps(x, y, HALF, HALF, h, 0.12))
      const hitSaw = this.level.saws?.some((saw) => {
        const [sx, sy] = sawPosition(saw, this.time)
        const dx = Math.max(0, Math.abs(sx - x) - HALF)
        const dy = Math.max(0, Math.abs(sy - y) - HALF)
        const r = (saw.r ?? SAW_RADIUS) - 0.12
        return dx * dx + dy * dy < r * r
      })
      if (hitHazard || hitSaw) {
        this.alive = false
        events.push('die')
        return
      }
    }
    if (y < -3) {
      this.alive = false
      events.push('die')
    }
  }

  /** Full copy of the mutable state (used by the level checker to search for routes). */
  saveState() {
    const p = this.player
    return {
      p: [p.position[0], p.position[1], p.velocity[0], p.velocity[1]],
      f: [this.prevX, this.prevY, this.facing, this.grounded, this.ground, this.alive, this.won, this.time,
        this.checkpoint, this.runVx, this.coyote, this.buffer, this.jumpHeld, this.jumping] as const,
      stars: [...this.stars],
      banked: [...this.bankedStars],
      springs: [...this.springTimes],
      movers: this.movers.map((m) => [m.body.position[0], m.body.position[1], m.body.velocity[0],
        m.body.velocity[1], m.s, m.dir, m.wait, m.active, m.prevX, m.prevY] as const),
      crumbles: this.crumbles.map((c) => [c.state, c.timer] as const),
    }
  }

  loadState(s: ReturnType<LevelSim['saveState']>) {
    const p = this.player
    ;[p.position[0], p.position[1], p.velocity[0], p.velocity[1]] = s.p
    ;[this.prevX, this.prevY, this.facing, this.grounded, this.ground, this.alive, this.won, this.time,
      this.checkpoint, this.runVx, this.coyote, this.buffer, this.jumpHeld, this.jumping] = s.f
    this.stars = [...s.stars]
    this.bankedStars = [...s.banked]
    this.springTimes = [...s.springs]
    this.movers.forEach((m, i) => {
      ;[m.body.position[0], m.body.position[1], m.body.velocity[0], m.body.velocity[1], m.s, m.dir,
        m.wait, m.active, m.prevX, m.prevY] = s.movers[i]
    })
    this.crumbles.forEach((c, i) => this.setCrumble(c, s.crumbles[i][0], s.crumbles[i][1]))
  }
}
