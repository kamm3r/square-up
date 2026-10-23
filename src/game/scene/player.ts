import { Group, PlaneGeometry } from 'three'
import type { LevelSim } from '../sim.js'
import type { Textures } from '../textures.js'
import { mesh, PIXEL, type FrameState } from './shared.js'

const SQUASH_STIFFNESS = 320
/** Low enough to overshoot once or twice, which is what makes it look squishy. */
const SQUASH_DAMPING = 13
const SQUASH_STEP = 1 / 240

/** The square hero: body, blinking eyes and a headband tail that flaps faster the faster you run. */
export class PlayerView {
  readonly root = new Group()
  private readonly squash = new Group()
  private readonly body
  private readonly eyes = new Group()
  private readonly tail = new Group()
  private blink = 2

  constructor(private readonly sim: LevelSim, private readonly frame: FrameState, textures: Textures) {
    // squash & stretch around the feet: the inner group puts the body back on its center
    this.squash.position.y = -0.5
    const inner = new Group()
    inner.position.y = 0.5
    this.squash.add(inner)
    this.root.add(this.squash)

    this.tail.position.set(0, 0.19, -0.01)
    this.tail.add(mesh(new PlaneGeometry(0.25, 0.125), { map: textures.tail, x: -0.12 }))
    this.body = mesh(new PlaneGeometry(1, 1), { map: textures.player, alphaTest: 0.5 })
    this.eyes.add(mesh(new PlaneGeometry(1, 1), { map: textures.eyes, alphaTest: 0.5, y: 0.03, z: 0.01 }))
    inner.add(this.tail, this.body, this.eyes)
  }

  update(dt: number) {
    const { sim, frame } = this
    const t = frame.clock
    const vx = sim.player.velocity[0]
    const vy = sim.player.velocity[1]
    const running = sim.grounded && Math.abs(vx) > 1

    this.root.position.set(frame.px, frame.py, 1)
    this.root.visible = sim.alive
    // squash & stretch is a springy wobble around a rest shape: square on the ground, tall and
    // thin while shooting up, back to square at the top of the jump, a little tall while falling
    const rest = sim.grounded || !sim.alive ? 1 : 1 + Math.min(0.8, Math.max(vy * 0.045, -vy * 0.012))
    for (let left = dt; left > 0; left -= SQUASH_STEP) {
      const h = Math.min(left, SQUASH_STEP)
      frame.squashVel += ((rest - frame.squash) * SQUASH_STIFFNESS - frame.squashVel * SQUASH_DAMPING) * h
      frame.squash += frame.squashVel * h
    }
    frame.squash = Math.min(2, Math.max(0.5, frame.squash))
    // keeps its volume like a 3D cube would: twice as tall is only ~0.7 as wide
    this.squash.scale.set(1 / Math.sqrt(frame.squash), frame.squash, 1)

    // hop a pixel up and down while running
    this.body.scale.x = sim.facing
    this.body.position.y = running && Math.sin(t * 22) > 0 ? PIXEL : 0

    this.blink -= dt
    if (this.blink < -0.12) this.blink = 2 + Math.random() * 3
    this.eyes.position.x = sim.facing * PIXEL
    this.eyes.position.y = -0.03 + (sim.grounded ? 0 : Math.sign(vy) * PIXEL) + this.body.position.y
    this.eyes.scale.y = this.blink < 0 ? 0.2 : 1

    const speed = Math.min(1, Math.abs(vx) / 8)
    this.tail.position.x = -sim.facing * 0.4
    this.tail.scale.x = sim.facing
    this.tail.rotation.z = sim.facing * (-0.6 + speed * 0.5 + Math.sin(t * (6 + speed * 14)) * (0.15 + speed * 0.25))
  }
}
