/**
 * Which decoded pictures stay in memory. Each picture that is on screen holds a reference; when the total estimated size is over
 * the budget, the least recently used pictures with NO reference are let go (their object URL is revoked and the browser frees
 * the decoded pixels). A picture on screen is never evicted.
 */
export interface CacheEntry {
  bytes: number
  refs: number
  lastUsed: number
}

export class PictureCache {
  private entries = new Map<string, CacheEntry>()
  private clock = 0
  constructor(
    private budget: () => number,
    private onEvict: (id: string) => void
  ) {}

  get totalBytes() {
    let n = 0
    for (const e of this.entries.values()) n += e.bytes
    return n
  }
  get size() {
    return this.entries.size
  }
  has(id: string) {
    return this.entries.has(id)
  }

  /** Adds (or touches) a picture, estimated at width x height x 4 bytes once decoded. */
  add(id: string, bytes: number) {
    const e = this.entries.get(id)
    if (e) {
      e.lastUsed = ++this.clock
      e.bytes = bytes
    } else this.entries.set(id, { bytes, refs: 0, lastUsed: ++this.clock })
    this.evict()
  }

  acquire(id: string) {
    const e = this.entries.get(id)
    if (e) {
      e.refs++
      e.lastUsed = ++this.clock
    }
  }

  release(id: string) {
    const e = this.entries.get(id)
    if (e) {
      e.refs = Math.max(0, e.refs - 1)
      this.evict()
    }
  }

  remove(id: string) {
    this.entries.delete(id)
  }

  /** Lets go of the oldest unused pictures until the total is within budget. Returns what was evicted. */
  evict(): string[] {
    const out: string[] = []
    let total = this.totalBytes
    if (total <= this.budget()) return out
    const idle = [...this.entries.entries()].filter(([, e]) => e.refs === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    for (const [id, e] of idle) {
      if (total <= this.budget()) break
      this.entries.delete(id)
      total -= e.bytes
      out.push(id)
      this.onEvict(id)
    }
    return out
  }
}
