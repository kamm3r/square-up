import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry } from 'three'
import { PIXEL } from './shared.js'

const MAX_PARTICLES = 160

/** Pool of square pixels for dust, sparkles and explosions. */
export class Particles {
  readonly mesh: InstancedMesh
  private readonly data = Array.from({ length: MAX_PARTICLES }, () => ({
    x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, gravity: 20, color: new Color(),
  }))
  private next = 0
  private readonly matrix = new Matrix4()

  constructor() {
    this.mesh = new InstancedMesh(new PlaneGeometry(PIXEL * 2, PIXEL * 2), new MeshBasicMaterial(), MAX_PARTICLES)
    this.mesh.frustumCulled = false
  }

  /** Burst of `count` pixels flying out from (x, y). `up` biases them upwards, `gravity` pulls them down. */
  emit(x: number, y: number, count: number, color: string, speed: number, up = 0, gravity = 20) {
    for (let i = 0; i < count; i++) {
      const p = this.data[this.next]
      this.next = (this.next + 1) % MAX_PARTICLES
      const a = Math.random() * Math.PI * 2
      const v = speed * (0.4 + Math.random() * 0.6)
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * v
      p.vy = Math.abs(Math.sin(a)) * v * 0.6 + up * speed * 0.3
      p.life = p.maxLife = 0.4 + Math.random() * 0.5
      p.gravity = gravity
      p.color.set(color)
    }
  }

  update(dt: number) {
    const m = this.mesh
    this.data.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt
        p.vy -= p.gravity * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
      }
      // shrink from 2px to 1px as they fade
      const scale = p.life > 0 ? (p.life / p.maxLife > 0.5 ? 1 : 0.5) : 0
      this.matrix.makeScale(scale, scale, 1)
      this.matrix.setPosition(p.x, p.y, 2)
      m.setMatrixAt(i, this.matrix)
      m.setColorAt(i, p.color)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }
}
