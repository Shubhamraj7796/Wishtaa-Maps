import type { ImageStore } from './store'

/**
 * Removes image blobs no topic uses any more, but not while undo could still bring
 * them back. A blob that became unused at undo-step S is kept until more than
 * `maxUndo` further steps have been recorded (by then the step that could restore it
 * has fallen off the undo stack, and any redo branch has been discarded).
 */
export class ImageGc {
  private step = 0
  private orphanedAt = new Map<string, number>()

  constructor(
    private store: ImageStore,
    private referenced: () => Set<string>,
    private maxUndo: number
  ) {}

  /** Call whenever a new undo step is recorded. */
  noteStep() {
    this.step++
  }

  /** Finds unused blobs and deletes the ones that can no longer be restored. Returns deleted ids. */
  async scan(): Promise<string[]> {
    const used = this.referenced()
    const deleted: string[] = []
    for (const id of await this.store.keys()) {
      if (used.has(id)) {
        this.orphanedAt.delete(id)
        continue
      }
      const since = this.orphanedAt.get(id)
      if (since === undefined) {
        this.orphanedAt.set(id, this.step)
      } else if (this.step - since > this.maxUndo) {
        await this.store.delete(id)
        this.orphanedAt.delete(id)
        deleted.push(id)
      }
    }
    return deleted
  }

  /**
   * Deletes every unused blob immediately. Only safe at start-up, when the undo
   * history is empty. Returns deleted ids.
   */
  async sweepAll(): Promise<string[]> {
    const used = this.referenced()
    const deleted: string[] = []
    for (const id of await this.store.keys()) {
      if (!used.has(id)) {
        await this.store.delete(id)
        deleted.push(id)
      }
    }
    return deleted
  }
}
