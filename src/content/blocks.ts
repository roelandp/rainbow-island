/** Building blocks and furniture: what Wyne earns and places on the island. */

export type BlockId = 'gras' | 'zand' | 'steen' | 'hout' | 'water' | 'bloemen' | 'regenboog' | 'roze' | 'lila' | 'mint'
export type FurnitureId =
  | 'mand'
  | 'krabpaal'
  | 'voerbak'
  | 'lantaarn'
  | 'bankje'
  | 'boompje'
  | 'hek'
  | 'vuurtoren'
  | 'hartjeslamp'
  | 'eenhoorn'
  | 'hemelbed'
  | 'regenboogboog'
  | 'lollyboom'
  | 'kasteeltoren'
export type TreatId = 'vis'
export type ItemId = BlockId | FurnitureId | TreatId

export interface ItemInfo {
  id: ItemId
  naam: string
  kind: 'block' | 'furniture' | 'treat'
  /** Emoji used in the inventory and reward flights. */
  icon: string
  /** Swatch background for the build bar (a colour or a CSS gradient). */
  color: string
  /** How often it drops as a reward, relative. 0 = never random. */
  weight: number
}

export const ITEMS: ItemInfo[] = [
  { id: 'gras', naam: 'Gras', kind: 'block', icon: '🟩', color: '#a6dc8c', weight: 5 },
  { id: 'zand', naam: 'Zand', kind: 'block', icon: '🟨', color: '#f2dca6', weight: 4 },
  { id: 'steen', naam: 'Steen', kind: 'block', icon: '⬜', color: '#c9c5cf', weight: 3 },
  { id: 'hout', naam: 'Hout', kind: 'block', icon: '🟫', color: '#d9a46c', weight: 3 },
  { id: 'water', naam: 'Water', kind: 'block', icon: '🟦', color: '#8fd0ee', weight: 2 },
  { id: 'bloemen', naam: 'Bloemen', kind: 'block', icon: '🌸', color: '#f6b8d0', weight: 2 },
  {
    id: 'regenboog',
    naam: 'Regenboogblok',
    kind: 'block',
    icon: '🌈',
    color: 'linear-gradient(180deg, #ffb3c1, #ffd3a8, #fff1a8, #c4ecb8, #b8dcfa, #d6c4fa)',
    weight: 2,
  },
  { id: 'roze', naam: 'Roze blok', kind: 'block', icon: '🩷', color: '#ffc4dc', weight: 2 },
  { id: 'lila', naam: 'Lila blok', kind: 'block', icon: '💜', color: '#d7c6f7', weight: 2 },
  { id: 'mint', naam: 'Mint blok', kind: 'block', icon: '💚', color: '#bfeedd', weight: 2 },
  { id: 'mand', naam: 'Kattenmand', kind: 'furniture', icon: '🧺', color: '#e8b27a', weight: 3 },
  { id: 'krabpaal', naam: 'Krabpaal', kind: 'furniture', icon: '🪵', color: '#d9b48c', weight: 3 },
  { id: 'voerbak', naam: 'Voerbak', kind: 'furniture', icon: '🥣', color: '#9ec9f0', weight: 3 },
  { id: 'lantaarn', naam: 'Lantaarn', kind: 'furniture', icon: '🏮', color: '#ffd27d', weight: 2 },
  { id: 'bankje', naam: 'Bankje', kind: 'furniture', icon: '🪑', color: '#c98f5b', weight: 2 },
  { id: 'boompje', naam: 'Boompje', kind: 'furniture', icon: '🌳', color: '#7cc47f', weight: 3 },
  { id: 'hek', naam: 'Hekje', kind: 'furniture', icon: '🚧', color: '#f4efe9', weight: 2 },
  { id: 'hartjeslamp', naam: 'Hartjeslamp', kind: 'furniture', icon: '💖', color: '#ffc4dc', weight: 2 },
  { id: 'eenhoorn', naam: 'Eenhoorn', kind: 'furniture', icon: '🦄', color: '#f3e8ff', weight: 2 },
  { id: 'hemelbed', naam: 'Prinsessenbed', kind: 'furniture', icon: '🛏️', color: '#f9d3e6', weight: 2 },
  { id: 'regenboogboog', naam: 'Regenboog', kind: 'furniture', icon: '🌈', color: '#e0f2ff', weight: 2 },
  { id: 'lollyboom', naam: 'Lollyboom', kind: 'furniture', icon: '🍭', color: '#ffe0f0', weight: 2 },
  { id: 'kasteeltoren', naam: 'Kasteeltorentje', kind: 'furniture', icon: '🏰', color: '#f7c6dc', weight: 1 },
  { id: 'vuurtoren', naam: 'Vuurtorentje', kind: 'furniture', icon: '🗼', color: '#f28b82', weight: 0 },
  { id: 'vis', naam: 'Vissnoepje', kind: 'treat', icon: '🐟', color: '#9ed0f0', weight: 0 },
]

export const BLOCKS = ITEMS.filter((i) => i.kind === 'block')
export const FURNITURE = ITEMS.filter((i) => i.kind === 'furniture')

export function itemInfo(id: string): ItemInfo | undefined {
  return ITEMS.find((i) => i.id === id)
}
