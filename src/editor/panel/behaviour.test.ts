import { describe, expect, it } from 'vitest'
import { afterSelection, closesOnLeave, panToReveal, selectionKind, TAB_FOR_KIND, type OpenInput } from './behaviour'

const sel = (o: Partial<Parameters<typeof selectionKind>[0]> = {}) => ({ selectedObject: null, imageSelected: null, selected: [] as string[], ...o })

describe('what is selected decides the section', () => {
  it('nothing, one topic, several topics, a picture, an object', () => {
    expect(selectionKind(sel())).toBe('none')
    expect(selectionKind(sel({ selected: ['a'] }))).toBe('topic')
    expect(selectionKind(sel({ selected: ['a', 'b'] }))).toBe('topics')
    expect(selectionKind(sel({ selected: ['a'], imageSelected: 'a' }))).toBe('picture')
    expect(selectionKind(sel({ selectedObject: { kind: 'relationship', id: 'r' } }))).toBe('object')
  })

  it('a picture counts only while its topic is the only selection', () => {
    expect(selectionKind(sel({ selected: ['a', 'b'], imageSelected: 'a' }))).toBe('topics')
    expect(selectionKind(sel({ selected: ['b'], imageSelected: 'a' }))).toBe('topic')
  })

  it('a selected object wins over everything', () => {
    expect(selectionKind(sel({ selectedObject: { kind: 'callout', id: 'c' }, selected: ['a'], imageSelected: 'a' }))).toBe('object')
  })

  it('maps each kind to its tab', () => {
    expect(TAB_FOR_KIND).toEqual({ none: 'canvas', topic: 'style', topics: 'style', picture: 'picture', object: 'object' })
  })
})

describe('when the panel opens and closes after the selection changes', () => {
  const base: OpenInput = { mode: 'auto', pinned: false, open: false, kind: 'topic', busy: false, hovered: false, opener: null }
  const run = (o: Partial<OpenInput>) => afterSelection({ ...base, ...o })

  it('Auto: selecting opens it', () => {
    expect(run({ kind: 'topic' })).toBe('open')
    expect(run({ kind: 'picture' })).toBe('open')
    expect(run({ kind: 'object' })).toBe('open')
  })

  it('Auto: already open stays open when another topic is selected', () => {
    expect(run({ open: true, kind: 'topic', opener: 'selection' })).toBe('stay')
  })

  it('Auto: clearing the selection closes a panel the selection opened', () => {
    expect(run({ open: true, kind: 'none', opener: 'selection' })).toBe('close')
    expect(run({ open: true, kind: 'none', opener: 'hover' })).toBe('close')
  })

  it('Auto: but not when pinned, opened from the handle, busy, or under the pointer', () => {
    expect(run({ open: true, kind: 'none', opener: 'selection', pinned: true })).toBe('stay')
    expect(run({ open: true, kind: 'none', opener: 'handle' })).toBe('stay')
    expect(run({ open: true, kind: 'none', opener: 'selection', busy: true })).toBe('stay')
    expect(run({ open: true, kind: 'none', opener: 'selection', hovered: true })).toBe('stay')
  })

  it('Auto: nothing selected and closed stays closed', () => {
    expect(run({ kind: 'none' })).toBe('stay')
  })

  it('Always: opens and never closes', () => {
    expect(run({ mode: 'always', kind: 'none' })).toBe('open')
    expect(run({ mode: 'always', open: true, kind: 'none', opener: 'selection' })).toBe('stay')
  })

  it('Manual: the selection never opens or closes it', () => {
    expect(run({ mode: 'manual', kind: 'topic' })).toBe('stay')
    expect(run({ mode: 'manual', open: true, kind: 'none', opener: 'selection' })).toBe('stay')
  })

  it('Pinned and closed (for example after Esc) opens again on a selection', () => {
    expect(run({ pinned: true, kind: 'topic' })).toBe('open')
    expect(run({ pinned: true, kind: 'none' })).toBe('stay')
  })
})

describe('closing when the pointer leaves', () => {
  const base = { mode: 'auto' as const, pinned: false, open: true, busy: false, opener: 'hover' as const }
  it('only a panel the pointer opened, and only when nothing keeps it', () => {
    expect(closesOnLeave(base)).toBe(true)
    expect(closesOnLeave({ ...base, opener: 'selection' })).toBe(false)
    expect(closesOnLeave({ ...base, opener: 'handle' })).toBe(false)
    expect(closesOnLeave({ ...base, pinned: true })).toBe(false)
    expect(closesOnLeave({ ...base, busy: true })).toBe(false)
    expect(closesOnLeave({ ...base, mode: 'always' })).toBe(false)
    expect(closesOnLeave({ ...base, open: false })).toBe(false)
  })
})

describe('keeping the selected topic visible when the panel opens', () => {
  const area = { w: 1000, h: 700 }
  it('does nothing when the topic is already clear of the panel', () => {
    expect(panToReveal({ x: 100, y: 100, w: 200, h: 60 }, area, 320)).toBe(0)
  })

  it('pans just far enough left to clear the panel', () => {
    // panel covers x >= 680; topic spans 650 to 850 (partly under it)
    const dx = panToReveal({ x: 650, y: 100, w: 200, h: 60 }, area, 320, 24)
    expect(dx).toBeGreaterThan(0)
    expect(650 + 200 - dx).toBeLessThanOrEqual(1000 - 320 - 24 + 0.001)
  })

  it('pans a topic hidden entirely under the panel into view', () => {
    const dx = panToReveal({ x: 800, y: 100, w: 100, h: 60 }, area, 320)
    expect(800 + 100 - dx).toBeLessThanOrEqual(1000 - 320)
  })

  it('never pushes the topic\'s own left edge off the screen', () => {
    const dx = panToReveal({ x: 50, y: 0, w: 900, h: 60 }, area, 320, 24)
    expect(50 - dx).toBeGreaterThanOrEqual(24 - 0.001)
  })
})
