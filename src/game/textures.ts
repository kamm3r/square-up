import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace } from 'three'

type Draw = (ctx: CanvasRenderingContext2D, px: (x: number, y: number, w: number, h: number, c: string) => void) => void

function pixelTexture(w: number, h: number, draw: Draw, repeat = true) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx, (x, y, pw, ph, c) => {
    ctx.fillStyle = c
    ctx.fillRect(x, y, pw, ph)
  })
  const tex = new CanvasTexture(canvas)
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = SRGBColorSpace
  if (repeat) tex.wrapS = tex.wrapT = RepeatWrapping
  return tex
}

// deterministic "random" so textures look the same every load
const rand = (seed: number) => {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const OUTLINE = '#1a1c2c'

/** Draw a shape from a per-pixel "inside" test, with a 1px dark outline around it. */
function drawShape(
  px: (x: number, y: number, w: number, h: number, c: string) => void,
  w: number,
  h: number,
  inside: (x: number, y: number) => boolean,
  color: (x: number, y: number) => string,
) {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside(x + 0.5, y + 0.5)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (at(x, y)) px(x, y, 1, 1, color(x, y))
      else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) px(x, y, 1, 1, OUTLINE)
    }
}

function inStar(x: number, y: number, cx: number, cy: number, outer: number, inner: number) {
  // point-in-polygon against a 5-pointed star
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function createTextures() {
  const grassTop = pixelTexture(16, 16, (_, px) => {
    const r = rand(7)
    px(0, 0, 16, 16, '#8f563b')
    for (let i = 0; i < 10; i++) px(Math.floor(r() * 15), 6 + Math.floor(r() * 9), 2, 1, '#663931')
    px(0, 0, 16, 5, '#6abe30')
    px(0, 0, 16, 1, '#99e550')
    for (let x = 0; x < 16; x += 3) px(x, 5, 2, 1 + (x % 2), '#6abe30')
    px(0, 15, 16, 1, '#663931')
  })

  const dirt = pixelTexture(16, 16, (_, px) => {
    const r = rand(11)
    px(0, 0, 16, 16, '#8f563b')
    for (let i = 0; i < 12; i++) px(Math.floor(r() * 15), Math.floor(r() * 15), 2, 1, '#663931')
    for (let i = 0; i < 4; i++) px(Math.floor(r() * 15), Math.floor(r() * 15), 1, 1, '#d9a066')
  })

  const stone = pixelTexture(16, 16, (_, px) => {
    px(0, 0, 16, 16, '#847e87')
    px(0, 0, 16, 1, '#9badb7')
    px(0, 7, 16, 1, '#595652')
    px(0, 15, 16, 1, '#595652')
    px(7, 0, 1, 7, '#595652')
    px(3, 8, 1, 7, '#595652')
    px(12, 8, 1, 7, '#595652')
    px(1, 1, 2, 1, '#9badb7')
    px(9, 9, 2, 1, '#9badb7')
  })

  const metal = pixelTexture(16, 16, (_, px) => {
    px(0, 0, 16, 16, '#5b6ee1')
    px(0, 0, 16, 2, '#639bff')
    px(0, 13, 16, 3, '#3f3f74')
    px(2, 6, 2, 2, '#cbdbfc')
    px(12, 6, 2, 2, '#cbdbfc')
  })

  const metalTrigger = pixelTexture(16, 16, (_, px) => {
    px(0, 0, 16, 16, '#5b6ee1')
    px(0, 0, 16, 2, '#639bff')
    px(0, 13, 16, 3, '#3f3f74')
    // chevron ">"
    for (let i = 0; i < 4; i++) {
      px(5 + i, 3 + i, 2, 1, '#fbf236')
      px(5 + i, 10 - i, 2, 1, '#fbf236')
    }
  })

  const goal = pixelTexture(16, 16, (_, px) => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) px(x * 4, y * 4, 4, 4, (x + y) % 2 ? '#fbf236' : '#df7126')
    px(0, 0, 16, 1, '#ffffff')
  })

  const spikes = pixelTexture(16, 8, (_, px) => {
    for (const ox of [0, 8]) {
      for (let row = 0; row < 7; row++) {
        const half = Math.floor((row + 1) / 2)
        px(ox + 4 - half, row + 1, half * 2, 1, row === 6 ? '#595652' : '#cbdbfc')
        px(ox + 4 - half, row + 1, 1, 1, '#9badb7')
      }
      px(ox + 3, 0, 2, 1, '#ffffff')
    }
  })

  const pillar = pixelTexture(16, 16, (_, px) => {
    px(0, 0, 16, 16, '#222034')
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) if ((x + y) % 8 < 4) px(x, y, 1, 1, '#ac3232')
  })

  const flag = pixelTexture(
    16,
    16,
    (_, px) => {
      px(2, 0, 2, 16, '#cbdbfc')
      px(2, 0, 1, 16, '#ffffff')
      px(4, 1, 10, 7, '#d95763')
      px(4, 1, 10, 1, '#ff8a95')
      px(7, 3, 4, 3, '#fbf236')
    },
    false,
  )

  const player = pixelTexture(
    16,
    16,
    (_, px) => {
      // rounded square body with an outline
      px(2, 1, 12, 14, OUTLINE)
      px(1, 2, 14, 12, OUTLINE)
      px(3, 2, 10, 12, '#41a6f6')
      px(2, 3, 12, 10, '#41a6f6')
      px(3, 2, 10, 1, '#73eff7')
      px(2, 3, 1, 4, '#73eff7')
      px(3, 13, 10, 1, '#3b5dc9')
      px(13, 8, 1, 5, '#3b5dc9')
      // headband
      px(2, 4, 12, 2, '#b13e53')
      px(2, 4, 12, 1, '#ef7d57')
      // blush
      px(3, 10, 2, 1, '#ff8a95')
      px(11, 10, 2, 1, '#ff8a95')
    },
    false,
  )

  const eyes = pixelTexture(
    16,
    16,
    (_, px) => {
      for (const x of [5, 9]) {
        px(x, 7, 2, 3, OUTLINE)
        px(x, 7, 1, 1, '#ffffff')
      }
    },
    false,
  )

  const tail = pixelTexture(
    4,
    2,
    (_, px) => {
      px(0, 0, 4, 2, '#b13e53')
      px(0, 0, 4, 1, '#ef7d57')
    },
    false,
  )

  const flag2 = pixelTexture(
    16,
    16,
    (_, px) => {
      px(2, 0, 2, 16, '#cbdbfc')
      px(2, 0, 1, 16, '#ffffff')
      px(4, 1, 5, 7, '#d95763')
      px(9, 2, 5, 7, '#d95763')
      px(4, 1, 5, 1, '#ff8a95')
      px(9, 2, 5, 1, '#ff8a95')
      px(7, 3, 2, 3, '#fbf236')
      px(9, 4, 2, 3, '#fbf236')
    },
    false,
  )

  const crumble = pixelTexture(16, 16, (_, px) => {
    px(0, 0, 16, 16, '#d9a066')
    px(0, 0, 16, 2, '#eec39a')
    px(0, 13, 16, 3, '#8f563b')
    for (const [x, y, w, h] of [
      [3, 2, 1, 3], [4, 5, 1, 2], [5, 7, 2, 1], [6, 8, 1, 3],
      [11, 2, 1, 4], [10, 6, 1, 3], [12, 9, 1, 3], [13, 8, 2, 1],
    ])
      px(x, y, w, h, '#663931')
  })

  const saw = pixelTexture(
    16,
    16,
    (_, px) => {
      const teeth = (x: number, y: number) => {
        const a = Math.atan2(y - 8, x - 8)
        return Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16) % 2 ? 7.4 : 6
      }
      const d = (x: number, y: number) => Math.hypot(x - 8, y - 8)
      drawShape(px, 16, 16, (x, y) => d(x, y) < teeth(x, y), (x, y) => {
        const r = d(x + 0.5, y + 0.5)
        if (r < 1.5) return '#ac3232'
        if (r < 2.6) return '#595652'
        if (r < 5) return x + y < 14 ? '#ffffff' : '#cbdbfc'
        return '#9badb7'
      })
    },
    false,
  )

  const spring = pixelTexture(
    16,
    8,
    (_, px) => {
      px(1, 0, 14, 2, OUTLINE)
      px(2, 0, 12, 1, '#ff8a95')
      px(2, 1, 12, 1, '#d95763')
      px(3, 2, 10, 1, '#cbdbfc')
      px(4, 3, 8, 1, '#847e87')
      px(3, 4, 10, 1, '#cbdbfc')
      px(4, 5, 8, 1, '#847e87')
      px(1, 6, 14, 2, OUTLINE)
      px(2, 6, 12, 1, '#595652')
    },
    false,
  )

  const star = pixelTexture(
    16,
    16,
    (_, px) => {
      drawShape(px, 16, 16, (x, y) => inStar(x, y, 8, 8.6, 7.4, 3.2), (x, y) => {
        if (x + y < 12 && x > 5) return '#ffffff'
        return y > 10 || x > 10 ? '#df7126' : '#fbf236'
      })
    },
    false,
  )

  const checkpoint = (color: string, shine: string, raised: boolean) =>
    pixelTexture(
      16,
      32,
      (_, px) => {
        px(7, 1, 2, 30, '#cbdbfc')
        px(7, 1, 1, 30, '#ffffff')
        px(6, 0, 4, 2, '#fbf236')
        px(4, 29, 8, 3, OUTLINE)
        px(5, 29, 6, 1, '#595652')
        const top = raised ? 2 : 18
        px(9, top, 6, 6, color)
        px(9, top, 6, 1, shine)
      },
      false,
    )
  const checkpointOff = checkpoint('#847e87', '#9badb7', false)
  const checkpointOn = checkpoint('#6abe30', '#99e550', true)

  const decor = (draw: Draw) => pixelTexture(8, 8, draw, false)
  const decorations = [
    decor((_, px) => {
      px(3, 4, 1, 4, '#4b692f')
      px(4, 6, 1, 1, '#6abe30')
      px(2, 1, 3, 3, '#d95763')
      px(3, 2, 1, 1, '#fbf236')
    }),
    decor((_, px) => {
      px(4, 4, 1, 4, '#4b692f')
      px(3, 5, 1, 1, '#6abe30')
      px(3, 1, 3, 3, '#fbf236')
      px(4, 2, 1, 1, '#df7126')
    }),
    decor((_, px) => {
      px(1, 5, 1, 3, '#6abe30')
      px(3, 4, 1, 4, '#99e550')
      px(5, 5, 1, 3, '#6abe30')
      px(2, 6, 1, 2, '#4b692f')
      px(6, 6, 1, 2, '#4b692f')
    }),
    decor((_, px) => {
      px(3, 5, 2, 3, '#eec39a')
      px(2, 2, 4, 1, '#d95763')
      px(1, 3, 6, 2, '#d95763')
      px(2, 3, 1, 1, '#ffffff')
      px(5, 3, 1, 1, '#ffffff')
    }),
  ]
  const pebble = decor((_, px) => {
    px(1, 5, 6, 3, '#847e87')
    px(2, 4, 4, 1, '#9badb7')
    px(5, 6, 2, 2, '#595652')
  })

  return {
    grassTop, dirt, stone, metal, metalTrigger, goal, spikes, pillar, flag, flag2, player, eyes, tail,
    crumble, saw, spring, star, checkpointOff, checkpointOn, decorations, pebble,
  }
}

export type Textures = ReturnType<typeof createTextures>

export function skyTexture(top: string, bottom: string) {
  const H = 32
  return pixelTexture(
    1,
    H,
    (_, px) => {
      const a = parseHex(top)
      const b = parseHex(bottom)
      const BANDS = 6
      for (let y = 0; y < H; y++) {
        const t = Math.floor((y / H) * BANDS) / (BANDS - 1)
        px(0, y, 1, 1, `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`)
      }
    },
    false,
  )
}

export function hillsTexture(color: string, seed: number, base: number, amp: number) {
  return pixelTexture(128, 48, (_, px) => {
    const r = rand(seed)
    const waves = [0, 1, 2].map(() => ({ f: 1 + Math.floor(r() * 3), p: r() * Math.PI * 2 }))
    for (let x = 0; x < 128; x++) {
      const t = (x / 128) * Math.PI * 2
      const hgt = base + amp * waves.reduce((s, w) => s + Math.sin(t * w.f + w.p), 0) / 3
      const top = Math.round(48 - hgt)
      px(x, top, 1, 48 - top, color)
    }
  })
}

export function cloudsTexture() {
  return pixelTexture(192, 64, (_, px) => {
    const r = rand(3)
    for (let i = 0; i < 6; i++) {
      const cx = Math.floor(r() * 170)
      const cy = 8 + Math.floor(r() * 40)
      const w = 14 + Math.floor(r() * 14)
      px(cx, cy, w, 4, '#ffffff')
      px(cx + 3, cy - 3, w - 8, 3, '#ffffff')
      px(cx + 2, cy + 4, w - 4, 1, '#cbdbfc')
    }
  })
}

function parseHex(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function mountainsTexture(color: string, seed: number) {
  return pixelTexture(128, 64, (_, px) => {
    const r = rand(seed)
    const peaks = Array.from({ length: 5 }, (_, i) => ({ x: i * 26 + r() * 14, h: 30 + r() * 26 }))
    // repeat peaks across the seam so the texture tiles
    const all = [...peaks, ...peaks.map((p) => ({ ...p, x: p.x + 128 })), ...peaks.map((p) => ({ ...p, x: p.x - 128 }))]
    for (let x = 0; x < 128; x++) {
      const hgt = Math.max(...all.map((p) => p.h - Math.abs(x - p.x) * 0.9))
      const top = Math.round(64 - hgt)
      px(x, top, 1, 64 - top, color)
      if (hgt > 44) px(x, top, 1, Math.min(4, Math.round(hgt - 44)), '#ffffff')
    }
  })
}

export function starfieldTexture(seed: number) {
  return pixelTexture(128, 96, (_, px) => {
    const r = rand(seed)
    for (let i = 0; i < 40; i++) px(Math.floor(r() * 128), Math.floor(r() * 96), 1, 1, r() > 0.3 ? '#ffffff' : '#cbdbfc')
    for (let i = 0; i < 4; i++) {
      const x = 2 + Math.floor(r() * 124)
      const y = 2 + Math.floor(r() * 92)
      px(x - 1, y, 3, 1, '#ffffff')
      px(x, y - 1, 1, 3, '#ffffff')
    }
  })
}

export function celestialTexture(night: boolean) {
  return pixelTexture(
    24,
    24,
    (_, px) => {
      const d = (x: number, y: number) => Math.hypot(x - 12, y - 12)
      if (night) {
        drawShape(px, 24, 24, (x, y) => d(x, y) < 8, (x, y) => {
          const crater = Math.hypot(x - 9, y - 10) < 2 || Math.hypot(x - 14, y - 15) < 1.5
          return crater ? '#b8c2d4' : '#e8eef8'
        })
      } else {
        for (let y = 0; y < 24; y++)
          for (let x = 0; x < 24; x++) {
            const r = d(x + 0.5, y + 0.5)
            if (r < 8) px(x, y, 1, 1, r < 5.5 ? '#fffbe0' : '#fbf236')
            else if (r < 11 && (x + y) % 2 === 0) px(x, y, 1, 1, '#fff6a0')
          }
      }
    },
    false,
  )
}
