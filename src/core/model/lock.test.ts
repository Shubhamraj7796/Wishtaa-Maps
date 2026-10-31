import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { addChild, deleteTopics, setText, setTopicStyle } from './commands'
import { createMapDoc, ensureRoot, LOCAL, snapshotTopics } from './doc'
import { isDocLocked, lockDoc } from './lock'
import { setSetting } from '../settings'
import { updateObject } from './objectCommands'

function docWithChild() {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Root')
  const child = addChild(doc, root, 'Child')
  return { doc, root, child }
}

describe('a locked document (Read mode)', () => {
  it('ignores every edit made through the app\'s commands', () => {
    const { doc, root, child } = docWithChild()
    const before = JSON.stringify(snapshotTopics(doc))
    lockDoc(doc.ydoc, true)
    expect(isDocLocked(doc.ydoc)).toBe(true)
    expect(addChild(doc, root, 'Sneaky')).toBeTruthy()
    setText(doc, child, 'Changed')
    setTopicStyle(doc, [child], { fill: '#ff0000' })
    deleteTopics(doc, [child])
    setSetting(doc, 'layout', 'org:down')
    expect(JSON.stringify(snapshotTopics(doc))).toBe(before)
    expect(doc.settings.get('layout')).toBeUndefined()
  })

  it('records nothing for undo, so Undo cannot be used to change a read map either', () => {
    const { doc, child } = docWithChild()
    doc.undo.clear()
    lockDoc(doc.ydoc, true)
    setText(doc, child, 'Changed')
    expect(doc.undo.undoStack).toHaveLength(0)
  })

  it('does not send out any update', () => {
    const { doc, child } = docWithChild()
    lockDoc(doc.ydoc, true)
    let updates = 0
    doc.ydoc.on('update', () => updates++)
    setText(doc, child, 'Changed')
    doc.ydoc.transact(() => doc.topics.delete(child), LOCAL)
    expect(updates).toBe(0)
    expect(doc.topics.has(child)).toBe(true)
  })

  it('still loads a saved copy and creates the central topic', () => {
    const src = docWithChild()
    const bytes = Y.encodeStateAsUpdate(src.doc.ydoc)
    const target = createMapDoc()
    lockDoc(target.ydoc, true)
    Y.applyUpdate(target.ydoc, bytes, 'load')
    expect(target.topics.size).toBe(2)
    const empty = createMapDoc()
    lockDoc(empty.ydoc, true)
    expect(ensureRoot(empty)).toBeTruthy()
  })

  it('works again once unlocked, and locks only the document it was applied to', () => {
    const a = docWithChild()
    const b = docWithChild()
    lockDoc(a.doc.ydoc, true)
    setText(b.doc, b.child, 'B changes')
    expect(b.doc.topics.get(b.child)?.text).toBe('B changes')
    lockDoc(a.doc.ydoc, false)
    setText(a.doc, a.child, 'A changes')
    expect(a.doc.topics.get(a.child)?.text).toBe('A changes')
  })

  it('blocks diagram objects too', () => {
    const { doc, root, child } = docWithChild()
    doc.relationships.set('r1', { id: 'r1', from: root, to: child, label: 'x', arrows: 'end', bend: 0 })
    lockDoc(doc.ydoc, true)
    updateObject(doc, 'relationship', 'r1', { label: 'changed' })
    expect(doc.relationships.get('r1')?.label).toBe('x')
  })
})
