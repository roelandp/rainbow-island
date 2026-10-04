import { STORAGE_KEY, emptySave, migrate, type Profile, type SaveFile } from './schema'

function read(): SaveFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptySave()
    return migrate(JSON.parse(raw))
  } catch {
    return emptySave()
  }
}

export class Store {
  private data: SaveFile

  constructor() {
    this.data = read()
  }

  get profile(): Profile {
    return this.data.profiles[this.data.activeProfile]
  }

  update(fn: (p: Profile) => void): void {
    fn(this.profile)
    this.save()
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
    } catch {
      // Private mode or a full disk: keep playing, just do not persist.
    }
  }

  reset(): void {
    this.data = emptySave()
    this.save()
  }
}
