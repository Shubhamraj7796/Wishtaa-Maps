import * as Y from 'yjs'
import { createMapDoc, ensureRoot } from '../../model/doc'
import { newId } from '../../model/ids'
import { makeTopic, type TopicData } from '../../model/topic'
import type { ImportedMap, ImportedTopic } from './parse'

/**
 * Writes an imported map into a Wishtaa map document and returns its saved content. Pictures are referenced by the
 * ids `imageIdFor` gives them (their bytes live in the image store, not in the map); a picture with no id is left out.
 */
export function buildMapContent(map: ImportedMap, imageIdFor: (hash: string) => string | undefined): Uint8Array {
  const doc = createMapDoc()
  const rootId = ensureRoot(doc, map.root.text)

  const imageOf = (t: ImportedTopic): TopicData['image'] => {
    const id = t.image ? imageIdFor(t.image.hash) : undefined
    return t.image && id ? { imageId: id, width: t.image.width, height: t.image.height, position: 'above' } : null
  }

  doc.ydoc.transact(() => {
    const root = doc.topics.get(rootId) as TopicData
    doc.topics.set(rootId, { ...root, text: map.root.text, style: { ...map.root.style }, image: imageOf(map.root) })

    // Iterative, so an extremely deep file can't overflow the stack.
    const stack: { topic: ImportedTopic; id: string }[] = [{ topic: map.root, id: rootId }]
    while (stack.length) {
      const { topic, id } = stack.pop() as { topic: ImportedTopic; id: string }
      topic.children.forEach((child, order) => {
        const cid = newId()
        doc.topics.set(
          cid,
          makeTopic({
            id: cid,
            parentId: id,
            order,
            text: child.text,
            style: { ...child.style },
            image: imageOf(child),
            ...(child.side ? { side: child.side } : {}),
          })
        )
        stack.push({ topic: child, id: cid })
      })
    }
  }, 'init')

  return Y.encodeStateAsUpdate(doc.ydoc)
}
