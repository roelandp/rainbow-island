import type { App } from '../app'
import { el } from './dom'

/** Whether a tap at client coordinates lands on Katrien. */
export function tapOnCat(app: App, clientX: number, clientY: number): boolean {
  const s = app.stage.getBoundingClientRect()
  const c = app.scene.catScreenPos()
  const dx = clientX - s.left - c.x
  const dy = clientY - s.top - c.y
  // catScreenPos is the head; the body hangs below it.
  return Math.abs(dx) < 70 && dy > -60 && dy < 110
}

/**
 * Tap Katrien, then tap a tile: she walks there. Returns a tap handler that
 * says whether it used the tap, and a cleanup function.
 */
export function catMover(app: App, parent: HTMLElement): { tap: (x: number, y: number) => boolean; readonly selected: boolean; dispose: () => void } {
  let selected = false
  const bubble = el('div.move-hint.bubble.hidden', { text: 'Tik op het eiland: waar moet Katrien heen?' })
  parent.appendChild(bubble)

  const setSelected = (on: boolean) => {
    selected = on
    bubble.classList.toggle('hidden', !on)
  }

  const tap = (x: number, y: number): boolean => {
    if (tapOnCat(app, x, y)) {
      app.audio.play('meow')
      app.scene.catJump()
      app.scene.burst('hearts', 'cat')
      setSelected(!selected)
      return true
    }
    if (!selected) return false
    const hit = app.scene.pick(x, y)
    if (!hit) {
      setSelected(false)
      return true
    }
    setSelected(false)
    app.catHoldUntil = Date.now() + 20_000
    app.audio.play('tap')
    void app.scene.catWalkTo(hit.x, hit.z)
    return true
  }

  return { tap, get selected() { return selected }, dispose: () => bubble.remove() }
}

/** Listens for short taps on the scene (not drags or pinches). */
export function onStageTap(app: App, handler: (x: number, y: number) => void): () => void {
  let start: { x: number; y: number; t: number; id: number } | null = null
  const down = (e: PointerEvent) => {
    // A second finger means a pinch, not a tap.
    start = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null
  }
  const up = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
    const quick = performance.now() - start.t < 600
    start = null
    if (moved < 12 && quick) handler(e.clientX, e.clientY)
  }
  app.stage.addEventListener('pointerdown', down)
  app.stage.addEventListener('pointerup', up)
  return () => {
    app.stage.removeEventListener('pointerdown', down)
    app.stage.removeEventListener('pointerup', up)
  }
}
