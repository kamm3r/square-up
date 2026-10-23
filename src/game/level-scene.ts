import { OrthographicCamera, Scene } from 'three'
import { playSfx } from './audio.js'
import { readInput } from './input.js'
import type { Level } from './levels.js'
import { Background } from './scene/background.js'
import { Particles } from './scene/particles.js'
import { PlayerView } from './scene/player.js'
import { createFrameState, disposeTree, type FrameState, type View } from './scene/shared.js'
import { WorldView } from './scene/world.js'
import { LevelSim, PLAYER_SIZE, STEP, type SimEvent } from './sim.js'
import * as game from './store.js'
import type { Textures } from './textures.js'

const NO_INPUT = { left: false, right: false, jump: false }

/** One level: its simulation plus everything drawn for it. Rebuilt on every (re)start. */
export class LevelScene {
  readonly scene = new Scene()
  readonly sim: LevelSim
  private readonly frame: FrameState
  private readonly background: Background
  private readonly world: WorldView
  private readonly player: PlayerView
  private readonly fx = new Particles()

  private acc = 0
  private time = 0
  private lastTimePush = 0
  private deathTimer = 0
  private winTimer = 0
  private dustTimer = 0
  private cam: [number, number] | null = null
  private readonly events: SimEvent[] = []

  constructor(
    private readonly level: Level,
    private readonly view: View,
    textures: Textures,
    /** Stars from earlier runs render as ghosts. */
    savedStars: boolean[],
  ) {
    this.sim = new LevelSim(level)
    this.frame = createFrameState(...level.start)
    this.background = new Background(level, view, this.frame)
    this.world = new WorldView(level, this.sim, this.frame, textures, savedStars)
    this.player = new PlayerView(this.sim, this.frame, textures)
    this.scene.add(this.background.root, this.background.ambient.mesh, this.world.root, this.player.root, this.fx.mesh)
  }

  private clampCam(x: number, y: number): [number, number] {
    const { view, level } = this
    const minX = view.halfW
    const maxX = level.width - view.halfW
    const minY = view.halfH - 1.5
    const maxY = Math.max(minY, level.height - view.halfH)
    return [minX > maxX ? level.width / 2 : Math.min(maxX, Math.max(minX, x)), Math.min(maxY, Math.max(minY, y))]
  }

  private handleEvent(e: SimEvent, starsBefore: boolean[]) {
    const { sim, frame, fx, level } = this
    const [x, y] = sim.player.position
    const feet = y - PLAYER_SIZE / 2
    switch (e) {
      case 'jump':
        // crouch flat, then the spring shoots the body up into a tall stretch
        frame.squash = 0.6
        frame.squashVel = 0
        playSfx('jump', 0.3)
        fx.emit(x, feet, 5, '#ffffff', 2, 0.5)
        break
      case 'land': {
        // the harder the fall, the flatter the splat (stepping off a curb barely shows)
        const impact = Math.min(1, sim.landSpeed / 24)
        frame.squash = 0.85 - impact * 0.35
        frame.squashVel = 0
        fx.emit(x, feet, 2 + Math.round(impact * 6), '#cbdbfc', 1.5 + impact * 2, 0.3)
        break
      }
      case 'spring':
        frame.squash = 0.5
        frame.squashVel = 0
        playSfx('jump', 0.4, 1.5)
        fx.emit(x, feet, 10, '#ff8a95', 4, 0.5)
        break
      case 'crumble':
        playSfx('tap', 0.25, 0.6)
        fx.emit(x, feet, 6, '#d9a066', 2, 0, 30)
        break
      case 'star': {
        playSfx('coin', 0.5)
        const i = sim.stars.findIndex((got, j) => got && !starsBefore[j])
        const [sx, sy] = level.stars[Math.max(0, i)]
        fx.emit(sx, sy, 14, '#fbf236', 6, 0.8, 6)
        fx.emit(sx, sy, 6, '#ffffff', 4, 0.8, 6)
        game.setRunStars([...sim.stars])
        break
      }
      case 'checkpoint': {
        playSfx('power_up', 0.35, 1.4)
        const [cx, cy] = level.checkpoints![sim.checkpoint]
        fx.emit(cx + 0.4, cy + 1.6, 12, '#6abe30', 4, 0.8, 8)
        break
      }
      case 'die':
        playSfx('hurt', 0.5)
        playSfx('explosion', 0.15)
        fx.emit(x, y, 18, '#41a6f6', 7, 1)
        fx.emit(x, y, 6, '#b13e53', 6, 1)
        frame.shake = 1
        this.deathTimer = 0.6
        break
      case 'win':
        playSfx('power_up', 0.5)
        for (const c of ['#fbf236', '#d95763', '#6abe30', '#5fcde4']) fx.emit(x, y + 0.5, 8, c, 8, 2.5)
        this.winTimer = 1
        break
    }
  }

  /** Advance by `delta` seconds and position everything for drawing with `camera`. */
  update(delta: number, clock: number, camera: OrthographicCamera) {
    const { sim, frame, view } = this
    const dt = Math.min(delta, 0.1)
    const screen = game.state.screen

    // the world keeps moving behind menus, but the player only listens to input while playing
    if (screen !== 'paused') {
      this.acc += dt
      const input = screen === 'playing' ? readInput() : NO_INPUT
      while (this.acc >= STEP) {
        this.acc -= STEP
        this.events.length = 0
        const starsBefore = [...sim.stars]
        sim.step(input, this.events)
        for (const e of this.events) this.handleEvent(e, starsBefore)
      }
      if (sim.alive && !sim.won && screen === 'playing') {
        this.time += dt
        if (this.time - this.lastTimePush > 0.1) {
          this.lastTimePush = this.time
          game.setTime(this.time)
        }
        // little dust puffs while running
        this.dustTimer -= dt
        if (sim.grounded && input.left !== input.right && this.dustTimer <= 0) {
          this.dustTimer = 0.12
          const [x, y] = sim.player.position
          this.fx.emit(x - sim.facing * 0.3, y - PLAYER_SIZE / 2, 1, '#cbdbfc', 1, 0.4, 5)
        }
      }
      if (this.deathTimer > 0 && (this.deathTimer -= dt) <= 0) {
        sim.respawn()
        game.died()
        game.setRunStars([...sim.stars])
      }
      if (this.winTimer > 0 && (this.winTimer -= dt) <= 0) game.completeLevel(this.time, [...sim.stars])
    }

    // interpolate between the last two physics steps for smooth motion
    frame.alpha = this.acc / STEP
    frame.time = sim.time - STEP * (1 - frame.alpha)
    frame.clock = clock
    const p = sim.player.position
    frame.px = sim.prevX + (p[0] - sim.prevX) * frame.alpha
    frame.py = sim.prevY + (p[1] - sim.prevY) * frame.alpha

    // camera follow (starts on the player instead of sliding in), snapped to whole screen pixels.
    // Behind the title menus it drifts slowly across the level and back instead.
    let [tx, ty] = this.clampCam(frame.px, frame.py + 1)
    if (game.MENU_SCREENS.includes(screen)) {
      const span = Math.max(0, this.level.width - view.halfW * 2)
      ;[tx, ty] = this.clampCam(view.halfW + span * (0.5 - 0.5 * Math.cos(clock * 0.04)), this.level.start[1] + 2)
    }
    if (!this.cam) this.cam = [tx, ty]
    const k = 1 - Math.exp(-dt * 6)
    this.cam[0] += (tx - this.cam[0]) * k
    this.cam[1] += (ty - this.cam[1]) * k
    frame.shake = Math.max(0, frame.shake - dt * 3)
    const shake = frame.shake * frame.shake * 0.35
    const cx = this.cam[0] + (Math.random() - 0.5) * shake
    const cy = this.cam[1] + (Math.random() - 0.5) * shake
    camera.position.x = frame.camX = Math.round(cx * view.unitPx) / view.unitPx
    camera.position.y = frame.camY = Math.round(cy * view.unitPx) / view.unitPx

    this.background.update()
    this.world.update()
    this.player.update(dt)
    this.fx.update(dt)
  }

  dispose() {
    disposeTree(this.scene)
    this.background.dispose()
  }
}
