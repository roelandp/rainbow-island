import type { App } from '../app'
import { findItem } from '../game/build'
import { goalDone } from '../game/day'

/**
 * Katrien wanders over the island on his own: to a random tile, now and then
 * to his scratching post or food bowl, and when he is tired, into his basket.
 * Returns a stop function.
 */
export function startRoaming(app: App, opts: { tiredSleep?: boolean } = {}): () => void {
  let stopped = false
  let timer = 0
  let busy = false

  const schedule = (ms: number) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(step, ms)
  }

  async function step(): Promise<void> {
    if (stopped || busy) return
    if (Date.now() < app.catHoldUntil) {
      schedule(app.catHoldUntil - Date.now() + 500)
      return
    }
    busy = true
    try {
      const blocks = app.store.profile.island.blocks
      const t = app.scene.tiles()
      const tired = goalDone(app.store.profile.days, Date.now())
      const basket = findItem(blocks, 'mand')
      if (opts.tiredSleep && tired && basket) {
        await app.scene.catWalkTo(basket.x, basket.z)
        if (stopped) return
        app.scene.catPose('sleep')
        return // stays asleep; no further roaming
      }
      const r = Math.random()
      const post = findItem(blocks, 'krabpaal')
      const bowl = findItem(blocks, 'voerbak')
      if (post && r < 0.2) {
        await app.scene.catWalkTo(post.x, post.z)
        if (stopped) return
        app.scene.catJump()
      } else if (bowl && r < 0.4) {
        await app.scene.catWalkTo(bowl.x, bowl.z)
        if (stopped) return
        app.scene.catPose('happy')
        window.setTimeout(() => !stopped && app.scene.catPose('idle'), 1500)
      } else {
        const x = t.minX + Math.floor(Math.random() * t.w)
        const z = t.minZ + Math.floor(Math.random() * t.d)
        await app.scene.catWalkTo(x, z)
      }
      if (stopped) return
      schedule(3500 + Math.random() * 4000)
    } finally {
      busy = false
    }
  }

  schedule(2500)
  return () => {
    stopped = true
    window.clearTimeout(timer)
  }
}
