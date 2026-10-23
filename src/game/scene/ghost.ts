import { Group, PlaneGeometry } from 'three'
import type { GhostRun } from '../ghost.js'
import type { Textures } from '../textures.js'
import { mesh, type FrameState } from './shared.js'

/** The ghost of your best run: a see-through hero, drawn just behind the real one. */
export class GhostView {
  readonly root = new Group()
  private readonly body

  constructor(private readonly ghost: GhostRun, private readonly frame: FrameState, textures: Textures) {
    const look = { transparent: true, opacity: 0.35 }
    this.body = mesh(new PlaneGeometry(1, 1), { map: textures.player, ...look })
    this.root.add(this.body, mesh(new PlaneGeometry(1, 1), { map: textures.eyes, ...look, y: 0.03, z: 0.01 }))
  }

  update(visible: boolean) {
    const { sim } = this.ghost
    // gone once it has finished, and while it's between death and respawn
    this.root.visible = visible && this.ghost.running && sim.alive
    if (!this.root.visible) return
    const [x, y] = sim.player.position
    const a = this.frame.alpha
    this.root.position.set(sim.prevX + (x - sim.prevX) * a, sim.prevY + (y - sim.prevY) * a, 0.9)
    this.root.scale.x = sim.facing
  }
}
