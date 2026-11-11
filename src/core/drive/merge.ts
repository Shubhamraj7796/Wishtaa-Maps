import * as Y from 'yjs'
import { createMapDoc, type MapDoc } from '../model/doc'

/**
 * The maps of a map file that are merged, by name. Anything that lives in the map file must be listed here, or it would not survive a
 * merge: add a name when a feature adds a new shared map.
 */
export const MERGE_MAPS = ['topics', 'meta', 'settings', 'relationships', 'callouts', 'boundaries', 'summaries', 'pdfSources', 'markup', 'pageEdits', 'notes'] as const
export type MergeMapName = (typeof MERGE_MAPS)[number]

type Snapshot = Record<MergeMapName, Map<string, unknown>>

export function snapshotOf(content: Uint8Array | null): Snapshot {
  const doc = createMapDoc()
  if (content) Y.applyUpdate(doc.ydoc, content)
  const out = {} as Snapshot
  for (const name of MERGE_MAPS) {
    const m = new Map<string, unknown>()
    ;(doc[name as keyof MapDoc] as Y.Map<unknown>).forEach((v, k) => m.set(k, v))
    out[name] = m
  }
  return out
}

/** Writes snapshots into a fresh document and returns its bytes. */
export function encodeSnapshot(s: Snapshot): Uint8Array {
  const doc = createMapDoc()
  doc.ydoc.transact(() => {
    for (const name of MERGE_MAPS) for (const [k, v] of s[name]) (doc[name as keyof MapDoc] as Y.Map<unknown>).set(k, v)
  }, 'merge')
  return Y.encodeStateAsUpdate(doc.ydoc)
}

export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a === undefined || b === undefined || a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined)
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined)
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export interface MergeOptions {
  /** When this device last changed the map, and when the other copy was saved (milliseconds): the newer side wins a clash. */
  localAt: number
  remoteAt: number
}

/** One thing both sides changed in different ways. The newer value was kept; the other is recoverable. */
export interface FieldConflict {
  map: MergeMapName
  key: string
  field?: string
  /** A short description for a person ("Topic “Dose”: text"). */
  label: string
  kept: 'local' | 'remote'
  keptValue: unknown
  lostValue: unknown
}

export interface MergeResult {
  content: Uint8Array
  conflicts: FieldConflict[]
  /** Changes that came in from the other copy and were combined with this device's (a count of keys and fields). */
  fromRemote: number
  fromLocal: number
  /** Some of this device's changes are in the result. */
  keptLocalChanges: boolean
}

const describe = (map: MergeMapName, key: string, value: unknown): string => {
  if (map === 'topics' && isObject(value) && typeof value.text === 'string') return `Topic “${value.text.slice(0, 40) || 'empty'}”`
  if (map === 'topics') return 'A topic'
  if (map === 'markup') return 'PDF markup'
  if (map === 'notes' && isObject(value)) return `Note “${(typeof value.title === 'string' && value.title ? value.title : 'untitled').slice(0, 40)}”`
  if (map === 'settings') return `Setting ${key}`
  return `${map} ${key}`
}

/**
 * Three-way merge of two versions of a map that both changed since `base` (the last version both sides had), by topic id (and the
 * id of every other object). What only one side changed is taken; what both changed in different places is combined; for the same
 * field of the same thing, the newer side wins and the other value is reported so it can be recovered. A deletion loses to an edit.
 * With no base, the two are combined as if the base were empty (nothing can be seen to be deleted).
 */
export function mergeMaps(base: Uint8Array | null, local: Uint8Array, remote: Uint8Array, opts: MergeOptions): MergeResult {
  const b = snapshotOf(base)
  const l = snapshotOf(local)
  const r = snapshotOf(remote)
  const lroot = l.meta.get('rootId')
  const rroot = r.meta.get('rootId')
  // Two maps with different central topics do not share a history (another file, not another copy of this one): never merged.
  if (lroot && rroot && lroot !== rroot) throw new Error('These are two unrelated maps.')
  const hasBase = !!base
  const newer: 'local' | 'remote' = opts.localAt > opts.remoteAt ? 'local' : 'remote'
  const conflicts: FieldConflict[] = []
  let fromRemote = 0
  let fromLocal = 0
  const out = {} as Snapshot

  for (const name of MERGE_MAPS) {
    const result = new Map<string, unknown>()
    const keys = new Set([...b[name].keys(), ...l[name].keys(), ...r[name].keys()])
    for (const key of keys) {
      const bv = hasBase ? b[name].get(key) : undefined
      const lv = l[name].get(key)
      const rv = r[name].get(key)
      const put = (v: unknown) => {
        if (v !== undefined) result.set(key, v)
      }
      if (deepEqual(lv, rv)) {
        put(lv)
        continue
      }
      if (hasBase && deepEqual(lv, bv)) {
        put(rv) // only the other copy changed it (or deleted it)
        fromRemote++
        continue
      }
      if (hasBase && deepEqual(rv, bv)) {
        put(lv)
        fromLocal++
        continue
      }
      if (lv === undefined || rv === undefined) {
        // One side deleted, the other changed or added: the edit wins over the deletion, so nothing written is lost.
        put(lv ?? rv)
        if (lv === undefined) fromRemote++
        else fromLocal++
        continue
      }
      if (isObject(lv) && isObject(rv)) {
        const label = describe(name, key, newer === 'local' ? lv : rv)
        const merge = (bo: Record<string, unknown>, lo: Record<string, unknown>, ro: Record<string, unknown>, path: string, depth: number): Record<string, unknown> => {
          const merged: Record<string, unknown> = {}
          for (const f of new Set([...Object.keys(bo), ...Object.keys(lo), ...Object.keys(ro)])) {
            const bf = bo[f]
            const lf = lo[f]
            const rf = ro[f]
            let v: unknown
            if (deepEqual(lf, rf)) v = lf
            else if (hasBase && deepEqual(lf, bf)) {
              v = rf
              fromRemote++
            } else if (hasBase && deepEqual(rf, bf)) {
              v = lf
              fromLocal++
            } else if (!hasBase && lf === undefined) v = rf
            else if (!hasBase && rf === undefined) v = lf
            else if (depth < 3 && isObject(lf) && isObject(rf) && !Array.isArray(lf)) {
              // Two plain objects (a topic's style, its picture, the marks on a picture, one mark): merged by their own fields.
              v = merge(isObject(bf) ? bf : {}, lf, rf, `${path}${f}.`, depth + 1)
            } else if (lf === undefined || rf === undefined) {
              v = lf ?? rf // one side removed it, the other changed it: the change stays
            } else {
              // The same field of the same thing, changed on both sides: the newer wins.
              v = newer === 'local' ? lf : rf
              conflicts.push({ map: name, key, field: `${path}${f}`, label: `${label}: ${path}${f}`, kept: newer, keptValue: v, lostValue: newer === 'local' ? rf : lf })
            }
            if (v !== undefined) merged[f] = v
          }
          return merged
        }
        result.set(key, merge(isObject(bv) ? bv : {}, lv, rv, '', 0))
        continue
      }
      const v = newer === 'local' ? lv : rv
      conflicts.push({ map: name, key, label: describe(name, key, v), kept: newer, keptValue: v, lostValue: newer === 'local' ? rv : lv })
      put(v)
    }
    out[name] = result
  }

  repairTree(out.topics, conflicts)
  return { content: encodeSnapshot(out), conflicts, fromRemote, fromLocal, keptLocalChanges: fromLocal > 0 || conflicts.some((c) => c.kept === 'local') }
}

type Topic = Record<string, unknown> & { id?: string; parentId?: string | null; order?: number; floatingPosition?: unknown }

/**
 * After a merge the tree can be broken by two devices acting on the same place: a topic added under one that was deleted, two moves
 * that put each under the other, two topics given the same place in their parent. Each is mended without losing anything.
 */
function repairTree(topics: Map<string, unknown>, conflicts: FieldConflict[]) {
  const list = topics as Map<string, Topic>
  const rootId = [...list.entries()].find(([, t]) => t.parentId === null && !t.floatingPosition)?.[0]
  if (!rootId) return
  const bad = (id: string, why: string) => {
    const t = list.get(id) as Topic
    list.set(id, { ...t, parentId: rootId })
    conflicts.push({ map: 'topics', key: id, field: 'parentId', label: `Topic “${String(t.text ?? '').slice(0, 40)}”: ${why}`, kept: 'remote', keptValue: rootId, lostValue: t.parentId })
  }
  for (const [id, t] of [...list]) {
    if (t.parentId && !list.has(t.parentId)) bad(id, 'its parent was deleted on another device, so it was moved under the central topic')
  }
  for (const [id] of [...list]) {
    const seen = new Set<string>([id])
    let at = list.get(id)?.parentId
    while (at) {
      if (seen.has(at)) {
        bad(id, 'two devices moved topics into each other, so it was moved under the central topic')
        break
      }
      seen.add(at)
      at = list.get(at)?.parentId
    }
  }
  // The same place twice: put the siblings in a stable order, one after the other.
  const groups = new Map<string, [string, Topic][]>()
  for (const [id, t] of list) {
    if (typeof t.parentId !== 'string') continue
    const g = groups.get(t.parentId) ?? []
    g.push([id, t])
    groups.set(t.parentId, g)
  }
  for (const g of groups.values()) {
    const orders = g.map(([, t]) => Number(t.order ?? 0))
    if (new Set(orders).size === orders.length) continue
    g.sort((x, y) => Number(x[1].order ?? 0) - Number(y[1].order ?? 0) || (x[0] < y[0] ? -1 : 1))
    g.forEach(([id, t], i) => {
      if (t.order !== i) list.set(id, { ...t, order: i })
    })
  }
}

/**
 * Puts what changed between `before` and `after` (a version of the map from before and after another device's changes were taken in)
 * into the document that is open on screen, as a quiet change: it is not an edit of the person's (no undo step, no save of its own).
 * Anything the person has changed since `before` is left alone, field by field, so typing is never overwritten. Returns how many
 * things were changed.
 */
export function applyDelta(doc: MapDoc, before: Uint8Array | null, after: Uint8Array): number {
  const b = snapshotOf(before)
  const a = snapshotOf(after)
  let changes = 0
  doc.ydoc.transact(() => {
    for (const name of MERGE_MAPS) {
      const live = doc[name as keyof MapDoc] as Y.Map<unknown>
      for (const key of new Set([...b[name].keys(), ...a[name].keys()])) {
        const bv = b[name].get(key)
        const av = a[name].get(key)
        if (deepEqual(bv, av)) continue
        const lv = live.get(key)
        if (deepEqual(lv, av)) continue
        if (deepEqual(lv, bv)) {
          if (av === undefined) live.delete(key)
          else live.set(key, av)
          changes++
          continue
        }
        if (isObject(lv) && isObject(av)) {
          let any = false
          const apply = (bo: Record<string, unknown>, lo: Record<string, unknown>, ao: Record<string, unknown>, depth: number): Record<string, unknown> => {
            const merged: Record<string, unknown> = { ...lo }
            for (const f of new Set([...Object.keys(bo), ...Object.keys(ao)])) {
              if (deepEqual(bo[f], ao[f])) continue
              if (deepEqual(lo[f], bo[f])) {
                if (ao[f] === undefined) delete merged[f]
                else merged[f] = ao[f]
                any = true
              } else if (depth < 3 && isObject(lo[f]) && isObject(ao[f])) {
                merged[f] = apply(isObject(bo[f]) ? (bo[f] as Record<string, unknown>) : {}, lo[f] as Record<string, unknown>, ao[f] as Record<string, unknown>, depth + 1)
              }
            }
            return merged
          }
          const merged = apply(isObject(bv) ? bv : {}, lv, av, 0)
          if (any) {
            live.set(key, merged)
            changes++
          }
        }
        // Otherwise the person changed it since: their value stays, and it is merged properly the next time it is saved.
      }
    }
  }, 'refresh')
  return changes
}
