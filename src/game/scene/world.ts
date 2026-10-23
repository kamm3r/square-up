import { Color, Group, PlaneGeometry, RingGeometry, type Mesh, type Texture } from 'three'
import type { Level, Platform, Rect } from '../levels.js'
import { SAW_RADIUS, sawPosition, type LevelSim } from '../sim.js'
import type { Textures } from '../textures.js'
import { basic, mesh, PIXEL, seeded, tiledPlane, type FrameState } from './shared.js'

const OUTLINE = '#1a1c2c'

/** Everything in the level except the player and background. */
export class WorldView {
  readonly root = new Group()
  /** Each animated object adds its per-frame update here. */
  private readonly updates: (() => void)[] = []

  constructor(
    private readonly level: Level,
    private readonly sim: LevelSim,
    private readonly frame: FrameState,
    private readonly tex: Textures,
    savedStars: boolean[],
  ) {
    this.staticPlatforms()
    this.decorations()
    this.movingPlatforms()
    this.crumbles()
    this.goal(level.goal)
    for (const h of level.hazards) {
      if (h.kind === 'spikes') this.root.add(texturedRect(h, tex.spikes, 0.2, 0.5, true))
      else this.pillar(h)
    }
    this.springs()
    this.checkpoints()
    this.saws()
    this.stars(savedStars)
  }

  update() {
    for (const u of this.updates) u()
  }

  /** Outlined block: grass/stone/metal top row, dirt or stone below. Centered on its group. */
  private block(rect: Rect, style?: Platform['style'], moving?: 'loop' | 'trigger') {
    const { w, h } = rect
    const topH = Math.min(1, h)
    const fillH = h - topH
    const { tex } = this
    const top = moving
      ? moving === 'trigger'
        ? tex.metalTrigger
        : tex.metal
      : style === 'stone'
        ? tex.stone
        : tex.grassTop
    const g = new Group()
    g.position.set(rect.x + w / 2, rect.y + h / 2, 0)
    g.add(mesh(new PlaneGeometry(w + PIXEL * 2, h + PIXEL * 2), { color: OUTLINE, z: -0.01 }))
    g.add(mesh(tiledPlane(w, topH, 1, topH), { map: top, y: h / 2 - topH / 2 }))
    if (fillH > 0)
      g.add(mesh(tiledPlane(w, fillH), { map: style === 'stone' ? tex.stone : tex.dirt, y: -h / 2 + fillH / 2 }))
    return g
  }

  private staticPlatforms() {
    for (const p of this.level.platforms) if (!p.move && !p.crumble) this.root.add(this.block(p, p.style))
  }

  private movingPlatforms() {
    const groups = this.level.platforms
      .filter((p) => p.move)
      .map((p) => this.block(p, undefined, p.move!.trigger ? 'trigger' : 'loop'))
    this.root.add(...groups)
    this.updates.push(() => {
      const a = this.frame.alpha
      this.sim.movers.forEach((m, i) => {
        groups[i].position.x = m.prevX + (m.body.position[0] - m.prevX) * a
        groups[i].position.y = m.prevY + (m.body.position[1] - m.prevY) * a
      })
    })
  }

  /** Crumbling platforms shake before falling, then come back; a faint ghost shows where. */
  private crumbles() {
    const parts = this.sim.crumbles.map((c) => {
      const solid = new Group()
      solid.add(mesh(new PlaneGeometry(c.rect.w + PIXEL * 2, c.rect.h + PIXEL * 2), { color: OUTLINE, z: -0.01 }))
      solid.add(mesh(tiledPlane(c.rect.w, c.rect.h, 1, c.rect.h), { map: this.tex.crumble }))
      const ghost = mesh(new PlaneGeometry(c.rect.w, c.rect.h), {
        transparent: true,
        opacity: 0.12,
        x: c.rect.x + c.rect.w / 2,
        y: c.rect.y + c.rect.h / 2,
        z: -0.02,
      })
      this.root.add(solid, ghost)
      return { solid, ghost }
    })
    this.updates.push(() => {
      const t = this.frame.clock
      this.sim.crumbles.forEach((c, i) => {
        const { solid, ghost } = parts[i]
        solid.visible = c.state !== 'gone'
        ghost.visible = c.state === 'gone'
        const shaking = c.state === 'shaking'
        const shake = shaking ? (Math.sin(t * 90) > 0 ? PIXEL : -PIXEL) : 0
        solid.position.set(c.rect.x + c.rect.w / 2 + shake, c.rect.y + c.rect.h / 2 - (shaking ? PIXEL : 0), 0)
      })
    })
  }

  /** Deadly striped wall with a pulsing red glow around it. */
  private pillar(rect: Rect) {
    const glow = mesh(new PlaneGeometry(rect.w + PIXEL * 4, rect.h + PIXEL * 4), {
      color: '#ac3232',
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h / 2,
      z: 0.15,
    })
    this.root.add(glow, texturedRect(rect, this.tex.pillar, 0.2))
    const colors = [new Color('#ac3232'), new Color('#ff5050')]
    this.updates.push(() => {
      const pulse = (Math.sin(this.frame.clock * 5) + 1) / 2
      basic(glow).color.lerpColors(colors[0], colors[1], pulse)
    })
  }

  private goal(rect: Rect) {
    const base = new Group()
    base.position.set(rect.x + rect.w / 2, rect.y + rect.h / 2, 0)
    base.add(mesh(new PlaneGeometry(rect.w + PIXEL * 2, rect.h + PIXEL * 2), { color: OUTLINE, z: -0.01 }))
    base.add(mesh(tiledPlane(rect.w, rect.h), { map: this.tex.goal }))
    const flag = mesh(new PlaneGeometry(1, 1), {
      map: this.tex.flag,
      alphaTest: 0.5,
      x: rect.x + rect.w - 0.7,
      y: rect.y + rect.h + 0.5,
      z: 0.1,
    })
    this.root.add(base, flag)
    // two-frame flutter
    this.updates.push(() => {
      basic(flag).map = Math.floor(this.frame.clock * 4) % 2 ? this.tex.flag2 : this.tex.flag
    })
  }

  private saws() {
    const saws = this.level.saws ?? []
    const blades = saws.map((saw) => {
      // faint track so the path is readable
      const track = { color: OUTLINE, transparent: true, opacity: 0.35, z: -0.5 }
      if (saw.orbit) {
        const r = saw.orbit.radius
        this.root.add(mesh(new RingGeometry(r - PIXEL / 2, r + PIXEL / 2, 48), { ...track, x: saw.x, y: saw.y }))
      } else if (saw.move) {
        const [dx, dy] = saw.move.to
        const line = mesh(new PlaneGeometry(Math.hypot(dx, dy), PIXEL), { ...track, x: saw.x + dx / 2, y: saw.y + dy / 2 })
        line.rotation.z = Math.atan2(dy, dx)
        this.root.add(line)
      }
      const d = (saw.r ?? SAW_RADIUS) * 2 * (16 / 15)
      const blade = mesh(new PlaneGeometry(d, d), { map: this.tex.saw, alphaTest: 0.5 })
      this.root.add(blade)
      return blade
    })
    this.updates.push(() => {
      const t = this.frame.time
      saws.forEach((saw, i) => {
        const [x, y] = sawPosition(saw, t)
        blades[i].position.set(x, y, 0.3)
        blades[i].rotation.z = -t * 10
      })
    })
  }

  private springs() {
    const springs = this.level.springs ?? []
    const meshes = springs.map(([sx, sy]) => {
      const m = mesh(new PlaneGeometry(1, 0.5), { map: this.tex.spring, alphaTest: 0.5, x: sx + 0.5, y: sy + 0.25, z: 0.25 })
      this.root.add(m)
      return m
    })
    this.updates.push(() => {
      springs.forEach(([, sy], i) => {
        // stretch up when fired, then wobble back
        const t = this.frame.time - this.sim.springTimes[i]
        const s = t >= 0 && t < 0.4 ? 1 + Math.sin(t * 25) * 0.6 * (1 - t / 0.4) : 1
        meshes[i].scale.y = s
        meshes[i].position.y = sy + 0.25 * s
      })
    })
  }

  private checkpoints() {
    const flags = (this.level.checkpoints ?? []).map(([x, y]) => {
      const m = mesh(new PlaneGeometry(1, 2), { map: this.tex.checkpointOff, alphaTest: 0.5, x, y: y + 1, z: -0.3 })
      this.root.add(m)
      return m
    })
    this.updates.push(() => {
      flags.forEach((m, i) => {
        basic(m).map = this.sim.checkpoint >= i ? this.tex.checkpointOn : this.tex.checkpointOff
      })
    })
  }

  /** Collectible stars: bob around, vanish when taken. Stars saved in earlier runs show as ghosts. */
  private stars(saved: boolean[]) {
    const stars = this.level.stars
    const meshes = stars.map((_, i) => {
      const m = mesh(new PlaneGeometry(1, 1), {
        map: this.tex.star,
        alphaTest: 0.2,
        transparent: !!saved[i],
        opacity: saved[i] ? 0.4 : 1,
      })
      this.root.add(m)
      return m
    })
    this.updates.push(() => {
      const t = this.frame.clock
      stars.forEach(([x, y], i) => {
        const m = meshes[i]
        m.visible = !this.sim.stars[i]
        m.position.set(x, y + Math.round(Math.sin(t * 3 + i) * 2) * PIXEL, 0.4)
        // a little "turning" by squishing horizontally now and then
        m.scale.x = Math.abs(Math.cos(Math.max(0, Math.sin(t * 1.5 + i * 2) - 0.6) * 8))
      })
    })
  }

  /** Flowers, grass tufts and pebbles sprinkled on static platforms. Purely visual. */
  private decorations() {
    const { level, tex } = this
    const blocked: Rect[] = [
      ...level.hazards,
      ...(level.springs ?? []).map(([x, y]) => ({ x: x - 0.3, y, w: 1.6, h: 1 })),
      ...(level.checkpoints ?? []).map(([x, y]) => ({ x: x - 0.5, y, w: 1, h: 1 })),
    ]
    level.platforms.forEach((p, i) => {
      if (p.move || p.crumble || p.w < 1.5) return
      const r = seeded(i * 97 + level.width)
      const top = p.y + p.h
      for (let x = p.x + 0.4; x < p.x + p.w - 0.4; x += 0.7 + r() * 0.8) {
        if (r() < 0.45) continue
        const free = !blocked.some((b) => x > b.x - 0.3 && x < b.x + b.w + 0.3 && top >= b.y - 0.1 && top <= b.y + b.h)
        if (!free) continue
        const map = p.style === 'stone' ? tex.pebble : tex.decorations[Math.floor(r() * tex.decorations.length)]
        this.root.add(
          mesh(new PlaneGeometry(0.5, 0.5), { map, alphaTest: 0.5, x: Math.round(x * 16) / 16, y: top + 0.25, z: -0.05 }),
        )
      }
    })
  }
}

function texturedRect(rect: Rect, map: Texture, z = 0, tileH = 1, cutout = false): Mesh {
  return mesh(tiledPlane(rect.w, rect.h, 1, tileH), {
    map,
    alphaTest: cutout ? 0.5 : 0,
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
    z,
  })
}
