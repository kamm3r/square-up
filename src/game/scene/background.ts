import { Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, type Mesh, type Texture } from 'three'
import type { Level } from '../levels.js'
import {
  celestialTexture,
  cloudsTexture,
  hillsTexture,
  mountainsTexture,
  skyTexture,
  starfieldTexture,
} from '../textures.js'
import { basic, mesh, PIXEL, seeded, tiledPlane, type FrameState, type View } from './shared.js'

type Layer = { group: Group; mesh: Mesh; texW: number; fx: number; fy: number; baseY: number; drift: number }

/** Layered parallax background that follows the camera, plus drifting fireflies or petals. */
export class Background {
  readonly root = new Group()
  /** Lives in world space, so it's added to the scene next to (not inside) the background group. */
  readonly ambient: Ambient
  private readonly textures: Texture[]
  private readonly layers: Layer[] = []
  private readonly twinkle: [Mesh, number][] = []
  private readonly startY: number

  constructor(level: Level, private readonly view: View, private readonly frame: FrameState) {
    const { theme } = level
    const tex = {
      sky: skyTexture(theme.skyTop, theme.skyBottom),
      celestial: celestialTexture(!!theme.night),
      starsA: starfieldTexture(21),
      starsB: starfieldTexture(42),
      mountains: mountainsTexture(theme.mountains, 13),
      far: hillsTexture(theme.hillsFar, 5, 30, 12),
      near: hillsTexture(theme.hills, 9, 18, 10),
      clouds: cloudsTexture(),
    }
    this.textures = Object.values(tex)
    const w = view.halfW * 2 + 2
    const h = view.halfH * 2 + 2
    this.startY = view.halfH - 1.5

    this.root.add(mesh(new PlaneGeometry(w, h), { map: tex.sky, z: -20 }))
    if (theme.night) {
      const stars = tiledPlane(w, h, 8, 6)
      ;[tex.starsA, tex.starsB].forEach((map, i) => {
        const m = mesh(i ? stars.clone() : stars, { map, transparent: true, z: -19.9 + i * 0.05 })
        this.root.add(m)
        this.twinkle.push([m, i * Math.PI])
      })
    }
    this.root.add(
      mesh(new PlaneGeometry(1.5, 1.5), {
        map: tex.celestial,
        alphaTest: 0.5,
        x: view.halfW * 0.55,
        y: view.halfH * 0.55,
        z: -19.8,
      }),
    )

    // each layer: a strip with the texture on top, and a solid block of its color below it
    const layer = (map: Texture, color: string | null, z: number, stripH: number, texW: number, y: number,
      fx: number, fy: number, baseY: number, drift = 0) => {
      const group = new Group()
      const strip = mesh(tiledPlane(w, stripH, texW, stripH), { map, alphaTest: 0.5, y, z })
      group.add(strip)
      if (color) group.add(mesh(new PlaneGeometry(w, h), { color, y: -h / 2, z }))
      this.root.add(group)
      this.layers.push({ group, mesh: strip, texW, fx, fy, baseY, drift })
    }
    layer(tex.clouds, null, -19, 4, 12, 2, 0.08, 0.15, view.halfH + 0.5, 0.3)
    basic(this.layers[0].mesh).color.set(theme.clouds ?? '#ffffff')
    layer(tex.mountains, theme.mountains, -18.5, 4, 8, 2, 0.05, 0.12, 2.5)
    layer(tex.far, theme.hillsFar, -18, 3, 8, 1.5, 0.15, 0.25, 1.5)
    layer(tex.near, theme.hills, -17, 3, 8, 1.5, 0.35, 0.5, 0)

    this.ambient = new Ambient(!!theme.night, view, frame)
  }

  update() {
    const { frame, view } = this
    const cx = frame.camX
    const cy = frame.camY
    const t = frame.clock
    this.root.position.set(cx, cy, 0)
    const climb = cy - this.startY
    // each layer sinks as the camera climbs and scrolls sideways via its texture offset
    for (const l of this.layers) {
      l.group.position.y = -view.halfH + l.baseY - climb * l.fy
      basic(l.mesh).map!.offset.x = (cx * l.fx + t * l.drift) / l.texW
    }
    // two star layers fading in and out of phase = twinkling
    for (const [m, phase] of this.twinkle) {
      basic(m).opacity = 0.55 + Math.sin(t * 1.3 + phase) * 0.45
      basic(m).map!.offset.set((cx * 0.02) / 8, (cy * 0.02) / 6)
    }
    this.ambient.update()
  }

  dispose() {
    for (const t of this.textures) t.dispose()
  }
}

const AMBIENT_COUNT = 28

/** Drifting fireflies at night, falling petals during the day. Wraps around the view. */
class Ambient {
  readonly mesh: InstancedMesh
  private readonly matrix = new Matrix4()
  private readonly motes

  constructor(private readonly night: boolean, private readonly view: View, private readonly frame: FrameState) {
    this.mesh = new InstancedMesh(new PlaneGeometry(PIXEL * 2, PIXEL * 2), new MeshBasicMaterial(), AMBIENT_COUNT)
    this.mesh.frustumCulled = false
    const r = seeded(night ? 7 : 3)
    const palette = night ? ['#fbf236', '#99e550', '#fff6a0'] : ['#ffffff', '#ff8a95', '#fbf236']
    this.motes = Array.from({ length: AMBIENT_COUNT }, () => ({
      x: r() * 100,
      y: r() * 100,
      speed: 0.3 + r() * 0.5,
      wobble: r() * Math.PI * 2,
      color: new Color(palette[Math.floor(r() * palette.length)]),
    }))
  }

  update() {
    const { night, frame, mesh: m } = this
    const t = frame.clock
    const W = this.view.halfW * 2 + 2
    const H = this.view.halfH * 2 + 2
    const wrap = (v: number, size: number, center: number) =>
      center - size / 2 + ((((v - center + size / 2) % size) + size) % size)
    this.motes.forEach((d, i) => {
      const x = night ? d.x + Math.sin(t * d.speed + d.wobble) * 1.5 : d.x + t * d.speed * 1.2
      const y = night ? d.y + Math.cos(t * d.speed * 0.8 + d.wobble) * 1 : d.y - t * d.speed
      // fireflies blink, petals flutter between 2px and 1px wide
      const s = night ? (Math.sin(t * 3 + d.wobble * 3) > -0.3 ? 1 : 0) : Math.sin(t * 4 + d.wobble) > 0 ? 1 : 0.5
      this.matrix.makeScale(s, night ? s : 1, 1)
      this.matrix.setPosition(wrap(x, W, frame.camX), wrap(y, H, frame.camY), -1)
      m.setMatrixAt(i, this.matrix)
      m.setColorAt(i, d.color)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }
}
