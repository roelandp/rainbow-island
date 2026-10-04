/**
 * Tiny time-driven animation helpers for the scene. Everything runs on scene time, so
 * pausing the scene pauses all running animations and pending promises.
 */

export const clamp01 = (k: number): number => (k < 0 ? 0 : k > 1 ? 1 : k)
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

export function easeOutBack(k: number, s = 1.70158): number {
  const c3 = s + 1
  const x = k - 1
  return 1 + c3 * x * x * x + s * x * x
}
export const easeOutCubic = (k: number): number => 1 - Math.pow(1 - k, 3)
export const easeInCubic = (k: number): number => k * k * k
export const easeInOutCubic = (k: number): number =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
export const easeInOutSine = (k: number): number => -(Math.cos(Math.PI * k) - 1) / 2

/** Exponential smoothing factor for a time constant (seconds). */
export const damp = (dt: number, tau: number): number => 1 - Math.exp(-dt / Math.max(1e-4, tau))

interface Task {
  elapsed: number
  dur: number
  fn: (k: number, dt: number) => void
  alive?: () => boolean
  resolve: () => void
}

/**
 * Runs timed callbacks. `run(dur, fn)` calls fn(k) every frame with k going 0..1 and
 * resolves when done. If `alive()` turns false the task stops and resolves immediately,
 * so async sequences can be cancelled by checking a token after each await.
 */
export class Animator {
  private tasks: Task[] = []

  run(dur: number, fn: (k: number, dt: number) => void, alive?: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      if (alive && !alive()) {
        resolve()
        return
      }
      this.tasks.push({ elapsed: 0, dur: Math.max(1e-4, dur), fn, alive, resolve })
    })
  }

  wait(dur: number, alive?: () => boolean): Promise<void> {
    return this.run(dur, () => {}, alive)
  }

  update(dt: number): void {
    if (!this.tasks.length) return
    const tasks = this.tasks
    this.tasks = []
    const keep: Task[] = []
    for (const task of tasks) {
      if (task.alive && !task.alive()) {
        task.resolve()
        continue
      }
      task.elapsed += dt
      const k = clamp01(task.elapsed / task.dur)
      task.fn(k, dt)
      if (k >= 1) task.resolve()
      else keep.push(task)
    }
    // tasks started during callbacks were pushed into this.tasks
    this.tasks = keep.concat(this.tasks)
  }

  clear(): void {
    for (const task of this.tasks) task.resolve()
    this.tasks = []
  }
}

/** Deterministic hash in [0,1) for integer coordinates. */
export function hash2(x: number, z: number, salt = 0): number {
  let h = (x * 374761393 + z * 668265263 + salt * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
