import { describe, expect, it } from 'vitest'
import { canPlace, height, place, removeTop, turnTop } from './build'

const bounds = { minX: -2, minZ: -2, w: 4, d: 4 }

describe('building', () => {
  it('stacks blocks upward and takes the top one off', () => {
    let b = place([], bounds, 0, 0, 'gras')!
    b = place(b, bounds, 0, 0, 'steen')!
    expect(height(b, 0, 0)).toBe(2)
    expect(b[1]).toEqual({ x: 0, z: 0, y: 1, type: 'steen' })
    const r = removeTop(b, 0, 0)!
    expect(r.removed).toBe('steen')
    expect(height(r.blocks, 0, 0)).toBe(1)
    expect(removeTop([], 1, 1)).toBeNull()
  })

  it('turns furniture a quarter per tap, but not blocks', () => {
    let b = place([], bounds, 0, 0, 'bankje')!
    for (let i = 1; i <= 4; i++) {
      b = turnTop(b, 0, 0)!
      expect(b[0].rot).toBe(i % 4)
    }
    expect(turnTop(place([], bounds, 0, 0, 'gras')!, 0, 0)).toBeNull()
    expect(turnTop([], 1, 1)).toBeNull()
  })

  it('refuses outside the island, on furniture, on water and too high', () => {
    expect(canPlace([], bounds, 2, 0, 'gras')).toBe('buiten')
    expect(canPlace([], bounds, -2, -2, 'gras')).toBeNull()
    const withBench = place([], bounds, 0, 0, 'bankje')!
    expect(canPlace(withBench, bounds, 0, 0, 'gras')).toBe('bovenop-meubel')
    const withWater = place([], bounds, 1, 1, 'water')!
    expect(canPlace(withWater, bounds, 1, 1, 'gras')).toBe('bovenop-water')
    let tower: ReturnType<typeof place> = []
    for (let i = 0; i < 6; i++) tower = place(tower!, bounds, 0, 1, 'steen')
    expect(canPlace(tower!, bounds, 0, 1, 'steen')).toBe('te-hoog')
  })
})
