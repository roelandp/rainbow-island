/**
 * The painted half of dressing up: fur patterns and the hats that are not
 * collectibles. Everything is plain canvas drawing so it needs no new assets.
 */

/** Small deterministic generator, so a pattern looks the same every compose. */
function rng(seed: number): () => number {
  let s = seed
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Paints a fur pattern across the whole canvas. The caller clips it to the
 * kitten with `source-atop`, so this can draw edge to edge.
 */
export function paintPattern(ctx: CanvasRenderingContext2D, id: string, w: number, h: number): void {
  const rand = rng(id.length * 977 + 17)
  if (id === 'tijger') {
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(156, 82, 32, 0.52)'
    const step = h * 0.052
    for (let y = -h * 0.06; y < h * 1.06; y += step) {
      for (const side of [0, 1]) {
        const x0 = side === 0 ? w * 0.01 : w * 0.5
        const len = w * (0.2 + rand() * 0.26)
        const yy = y + (side ? step * 0.5 : 0) + (rand() - 0.5) * step * 0.4
        ctx.lineWidth = h * (0.011 + rand() * 0.009)
        ctx.beginPath()
        ctx.moveTo(x0, yy)
        ctx.quadraticCurveTo(x0 + len * 0.5, yy - h * 0.018, x0 + len, yy + h * 0.006)
        ctx.stroke()
      }
    }
    return
  }

  if (id === 'zebra') {
    // Bold black bands wrapping across the body, same idea as the tiger stripes.
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(38, 32, 44, 0.8)'
    const step = h * 0.055
    for (let y = -h * 0.06; y < h * 1.06; y += step) {
      for (const side of [0, 1]) {
        const x0 = side === 0 ? -w * 0.02 : w * 0.47
        const len = w * (0.3 + rand() * 0.26)
        const yy = y + (side ? step * 0.5 : 0) + (rand() - 0.5) * step * 0.3
        ctx.lineWidth = h * (0.015 + rand() * 0.013)
        ctx.beginPath()
        ctx.moveTo(x0, yy)
        ctx.quadraticCurveTo(x0 + len * 0.5, yy - h * 0.026, x0 + len, yy + h * 0.004)
        ctx.stroke()
      }
    }
    return
  }

  if (id === 'luipaard') {
    // Rosettes: a broken ring of short arcs with a soft centre.
    const cell = h * 0.048
    ctx.lineCap = 'round'
    for (let y = 0; y < h + cell; y += cell) {
      for (let x = 0; x < w + cell; x += cell) {
        const cx = x + (rand() - 0.5) * cell * 0.8
        const cy = y + (rand() - 0.5) * cell * 0.8
        const r = cell * (0.17 + rand() * 0.1)
        ctx.strokeStyle = 'rgba(86, 50, 20, 0.75)'
        ctx.lineWidth = cell * 0.12
        for (let k = 0; k < 3; k++) {
          const from = k * 2.1 + rand() * 0.4
          ctx.beginPath()
          ctx.arc(cx, cy, r, from, from + 1.45)
          ctx.stroke()
        }
        ctx.fillStyle = 'rgba(124, 76, 32, 0.42)'
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

type HatPainter = (ctx: CanvasRenderingContext2D, w: number) => void

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/** A tall black hat, resting with its brim on the skull. */
const hogehoed: HatPainter = (ctx, w) => {
  ctx.fillStyle = '#2c2833'
  roundRect(ctx, -w * 0.34, -w * 0.96, w * 0.68, w * 1.0, w * 0.07)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
  roundRect(ctx, -w * 0.28, -w * 0.88, w * 0.11, w * 0.72, w * 0.05)
  ctx.fillStyle = '#c0392f'
  ctx.fillRect(-w * 0.34, -w * 0.24, w * 0.68, w * 0.15)
  ctx.fillStyle = '#23202b'
  ctx.beginPath()
  ctx.ellipse(0, -w * 0.04, w * 0.62, w * 0.13, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
  ctx.beginPath()
  ctx.ellipse(0, -w * 0.08, w * 0.62, w * 0.09, 0, Math.PI, Math.PI * 2)
  ctx.fill()
}

/** Sunglasses, centred between the eyes. */
const zonnebril: HatPainter = (ctx, w) => {
  const lensW = w * 0.44
  const lensH = w * 0.36
  ctx.strokeStyle = '#1b1b24'
  ctx.lineWidth = w * 0.05
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-w * 0.5, -lensH * 0.3)
  ctx.lineTo(-w * 0.64, -lensH * 0.05)
  ctx.moveTo(w * 0.5, -lensH * 0.3)
  ctx.lineTo(w * 0.64, -lensH * 0.05)
  ctx.stroke()

  for (const side of [-1, 1]) {
    const x = side * w * 0.28 - lensW / 2
    const grad = ctx.createLinearGradient(x, -lensH / 2, x + lensW, lensH / 2)
    grad.addColorStop(0, '#3b3b58')
    grad.addColorStop(1, '#14141c')
    ctx.fillStyle = grad
    roundRect(ctx, x, -lensH / 2, lensW, lensH, lensH * 0.42)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.save()
    ctx.translate(x + lensW * 0.3, -lensH * 0.12)
    ctx.rotate(-0.6)
    roundRect(ctx, 0, 0, lensW * 0.12, lensH * 0.42, lensW * 0.06)
    ctx.restore()
  }
  ctx.fillStyle = '#1b1b24'
  ctx.fillRect(-w * 0.08, -lensH * 0.16, w * 0.16, lensH * 0.2)
}

/** A very small llama standing on the kitten's head. */
const lama: HatPainter = (ctx, w) => {
  const wool = '#f7ecd8'
  const shade = '#e2d0b2'
  const line = 'rgba(92, 70, 48, 0.42)'
  const outlined = (draw: () => void) => {
    draw()
    ctx.strokeStyle = line
    ctx.lineWidth = w * 0.02
    ctx.stroke()
  }

  // Legs with dark little hooves.
  for (const x of [-0.22, -0.08, 0.09, 0.23]) {
    ctx.fillStyle = shade
    roundRect(ctx, w * x - w * 0.055, -w * 0.38, w * 0.11, w * 0.38, w * 0.05)
    ctx.fillStyle = '#7d6a55'
    roundRect(ctx, w * x - w * 0.055, -w * 0.08, w * 0.11, w * 0.08, w * 0.035)
  }

  // Body.
  ctx.fillStyle = wool
  outlined(() => {
    ctx.beginPath()
    ctx.ellipse(0, -w * 0.6, w * 0.37, w * 0.26, 0, 0, Math.PI * 2)
    ctx.fill()
  })

  // Blanket, because a llama without a blanket is just a sheep.
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, -w * 0.6, w * 0.37, w * 0.26, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = '#d8694f'
  ctx.fillRect(-w * 0.24, -w * 0.88, w * 0.34, w * 0.34)
  ctx.fillStyle = '#4aa3b8'
  ctx.fillRect(-w * 0.24, -w * 0.72, w * 0.34, w * 0.08)
  ctx.restore()

  // Tail tuft.
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.ellipse(-w * 0.38, -w * 0.72, w * 0.08, w * 0.1, 0.3, 0, Math.PI * 2)
  ctx.fill()

  // Neck and head, leaning back a little over the body.
  ctx.save()
  ctx.translate(w * 0.24, -w * 0.74)
  ctx.rotate(0.18)
  ctx.fillStyle = wool
  outlined(() => {
    ctx.beginPath()
    ctx.roundRect(-w * 0.11, -w * 0.34, w * 0.22, w * 0.44, w * 0.1)
    ctx.fill()
  })
  // Ears, short and stubby.
  for (const dx of [-0.09, 0.05]) {
    ctx.beginPath()
    ctx.moveTo(w * dx, -w * 0.42)
    ctx.lineTo(w * (dx + 0.03), -w * 0.58)
    ctx.lineTo(w * (dx + 0.1), -w * 0.4)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = line
    ctx.lineWidth = w * 0.02
    ctx.stroke()
  }
  outlined(() => {
    ctx.beginPath()
    ctx.ellipse(w * 0.03, -w * 0.38, w * 0.18, w * 0.15, -0.25, 0, Math.PI * 2)
    ctx.fill()
  })
  // Muzzle and eye.
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.ellipse(w * 0.16, -w * 0.34, w * 0.09, w * 0.075, -0.25, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a2f2a'
  ctx.beginPath()
  ctx.arc(w * 0.05, -w * 0.43, w * 0.028, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(w * 0.2, -w * 0.36, w * 0.016, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}


export function paintCape(ctx: CanvasRenderingContext2D, color: string, w: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  // Drawing a superhero-style cape behind the back.
  // Origin is roughly the neck, so we draw downwards and outward.
  ctx.moveTo(-w * 0.1, w * 0.1);
  ctx.quadraticCurveTo(-w * 0.4, w * 0.4, -w * 0.4, w * 0.8);
  ctx.quadraticCurveTo(0, w * 0.9, w * 0.3, w * 0.8);
  ctx.quadraticCurveTo(w * 0.3, w * 0.4, w * 0.1, w * 0.1);
  ctx.fill();
  
  // A subtle fold or shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.1, w * 0.1);
  ctx.quadraticCurveTo(-w * 0.15, w * 0.5, -w * 0.2, w * 0.8);
  ctx.lineTo(w * 0.1, w * 0.82);
  ctx.quadraticCurveTo(w * 0.1, w * 0.5, w * 0.1, w * 0.1);
  ctx.fill();
}


const ketting: HatPainter = (ctx, w) => {
  // A thick gold chain with a big dollar sign or medallion.
  ctx.strokeStyle = '#f1c40f'; // Gold
  ctx.lineWidth = w * 0.08;
  ctx.lineCap = 'round';
  
  // The chain hangs down
  ctx.beginPath();
  ctx.arc(0, w * 0.1, w * 0.6, 0, Math.PI, false);
  ctx.stroke();

  // Medallion
  ctx.fillStyle = '#f39c12';
  ctx.beginPath();
  ctx.arc(0, w * 0.7, w * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e67e22';
  ctx.lineWidth = w * 0.03;
  ctx.stroke();

  // A star or gem inside the medallion
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, w * 0.7, w * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

const RAINBOW = ['#ff8fa3', '#ffb36b', '#ffe27a', '#8fe3a1', '#8fc8ff', '#c3a2ff']

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(cx, cy + r * 0.9)
  ctx.bezierCurveTo(cx - r * 1.5, cy - r * 0.1, cx - r * 0.9, cy - r * 1.3, cx, cy - r * 0.5)
  ctx.bezierCurveTo(cx + r * 0.9, cy - r * 1.3, cx + r * 1.5, cy - r * 0.1, cx, cy + r * 0.9)
  ctx.closePath()
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string): void {
  ctx.fillStyle = petal
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ffd95a'
  ctx.beginPath()
  ctx.arc(x, y, r * 0.32, 0, Math.PI * 2)
  ctx.fill()
}

/** A small princess tiara: a silver band with three points and pink gems. */
const tiara: HatPainter = (ctx, w) => {
  const grad = ctx.createLinearGradient(0, -w * 0.5, 0, w * 0.05)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(1, '#c9c3dc')
  ctx.fillStyle = grad
  ctx.strokeStyle = '#a79fc4'
  ctx.lineWidth = w * 0.02
  ctx.beginPath()
  ctx.moveTo(-w * 0.5, w * 0.04)
  ctx.lineTo(-w * 0.42, -w * 0.18)
  ctx.lineTo(-w * 0.24, -w * 0.12)
  ctx.lineTo(0, -w * 0.46)
  ctx.lineTo(w * 0.24, -w * 0.12)
  ctx.lineTo(w * 0.42, -w * 0.18)
  ctx.lineTo(w * 0.5, w * 0.04)
  ctx.quadraticCurveTo(0, -w * 0.06, -w * 0.5, w * 0.04)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  for (const [x, y, r, c] of [[0, -w * 0.2, w * 0.075, '#ff6fa8'], [-w * 0.3, -w * 0.04, w * 0.045, '#b98cff'], [w * 0.3, -w * 0.04, w * 0.045, '#7fd3ff']] as const) {
    ctx.fillStyle = c
    heartPath(ctx, x, y, r)
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff'
  for (const x of [-w * 0.42, 0, w * 0.42]) {
    ctx.beginPath()
    ctx.arc(x, x === 0 ? -w * 0.46 : -w * 0.18, w * 0.035, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A rainbow unicorn horn standing on the forehead. */
const eenhoorn: HatPainter = (ctx, w) => {
  const base = w * 0.5
  const tip = -w * 1.3
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(-base / 2, 0)
  ctx.quadraticCurveTo(-base * 0.3, tip * 0.5, 0, tip)
  ctx.quadraticCurveTo(base * 0.3, tip * 0.5, base / 2, 0)
  ctx.quadraticCurveTo(0, w * 0.08, -base / 2, 0)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, tip)
  RAINBOW.forEach((c, i) => grad.addColorStop(i / (RAINBOW.length - 1), c))
  ctx.fillStyle = grad
  ctx.fill()
  ctx.clip()
  // the spiral: soft diagonal bands
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = w * 0.045
  for (let i = 0; i < 6; i++) {
    const y = -w * 0.08 - i * w * 0.2
    ctx.beginPath()
    ctx.moveTo(-base * 0.6, y + w * 0.05)
    ctx.lineTo(base * 0.6, y - w * 0.07)
    ctx.stroke()
  }
  ctx.restore()
  ctx.fillStyle = '#fff6a8'
  starPath(ctx, base * 0.55, tip * 0.7, w * 0.08)
  ctx.fill()
  starPath(ctx, -base * 0.6, tip * 0.35, w * 0.05)
  ctx.fill()
}

/** A ring of pastel flowers across the top of the head. */
const bloemenkrans: HatPainter = (ctx, w) => {
  const colors = ['#ffb3d1', '#d8b8ff', '#fff1a8', '#a8e6ff', '#ffc3a0', '#ffb3d1', '#d8b8ff']
  const n = colors.length
  ctx.strokeStyle = '#6cc27a'
  ctx.lineWidth = w * 0.04
  ctx.beginPath()
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const x = (t - 0.5) * w
    const y = -Math.sin(t * Math.PI) * w * 0.14 + w * 0.06
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const x = (t - 0.5) * w * 0.94
    const y = -Math.sin(t * Math.PI) * w * 0.14 + w * 0.06
    ctx.fillStyle = '#7bd08a'
    ctx.beginPath()
    ctx.ellipse(x + w * 0.05, y + w * 0.03, w * 0.05, w * 0.022, 0.5, 0, Math.PI * 2)
    ctx.fill()
    flower(ctx, x, y, w * (i % 2 ? 0.07 : 0.085), colors[i])
  }
}

/** Pink glasses with heart-shaped lenses, centred between the eyes. */
const hartjesbril: HatPainter = (ctx, w) => {
  const r = w * 0.2
  ctx.strokeStyle = '#ff5c9d'
  ctx.lineWidth = w * 0.04
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-w * 0.1, -r * 0.2)
  ctx.quadraticCurveTo(0, -r * 0.5, w * 0.1, -r * 0.2)
  ctx.moveTo(-w * 0.48, -r * 0.4)
  ctx.lineTo(-w * 0.62, -r * 0.1)
  ctx.moveTo(w * 0.48, -r * 0.4)
  ctx.lineTo(w * 0.62, -r * 0.1)
  ctx.stroke()
  for (const side of [-1, 1]) {
    const cx = side * w * 0.28
    heartPath(ctx, cx, 0, r)
    ctx.fillStyle = 'rgba(255, 143, 190, 0.78)'
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.beginPath()
    ctx.ellipse(cx - r * 0.4, -r * 0.3, r * 0.14, r * 0.24, -0.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A bow in rainbow stripes, worn on the side of the head. */
const regenboogstrik: HatPainter = (ctx, w) => {
  const lobe = (side: number) => {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(0, -w * 0.18)
    ctx.quadraticCurveTo(side * w * 0.5, -w * 0.5, side * w * 0.5, -w * 0.18)
    ctx.quadraticCurveTo(side * w * 0.5, w * 0.14, 0, -w * 0.18)
    ctx.closePath()
    ctx.clip()
    const band = (w * 0.66) / RAINBOW.length
    RAINBOW.forEach((c, i) => {
      ctx.fillStyle = c
      ctx.fillRect(-w * 0.6, -w * 0.52 + i * band, w * 1.2, band + 1)
    })
    ctx.restore()
  }
  lobe(-1)
  lobe(1)
  ctx.fillStyle = '#ff8fc4'
  ctx.beginPath()
  ctx.ellipse(0, -w * 0.18, w * 0.1, w * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.beginPath()
  ctx.ellipse(-w * 0.03, -w * 0.22, w * 0.03, w * 0.04, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** A hair clip with three glittery stars. */
const sterrenspeld: HatPainter = (ctx, w) => {
  ctx.strokeStyle = '#e7c35a'
  ctx.lineWidth = w * 0.06
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-w * 0.42, -w * 0.05)
  ctx.lineTo(w * 0.42, -w * 0.22)
  ctx.stroke()
  const stars: [number, number, number, string][] = [
    [-w * 0.3, -w * 0.12, w * 0.2, '#ffe066'],
    [w * 0.02, -w * 0.25, w * 0.24, '#ff9ccc'],
    [w * 0.33, -w * 0.24, w * 0.18, '#a9d8ff'],
  ]
  for (const [x, y, r, c] of stars) {
    ctx.fillStyle = c
    starPath(ctx, x, y, r)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
    ctx.beginPath()
    ctx.arc(x - r * 0.15, y - r * 0.2, r * 0.13, 0, Math.PI * 2)
    ctx.fill()
  }
}

export const DRAWN_HATS: Record<string, HatPainter> = {
  hogehoed,
  zonnebril,
  lama,
  ketting,
  tiara,
  eenhoorn,
  bloemenkrans,
  hartjesbril,
  regenboogstrik,
  sterrenspeld,
}
