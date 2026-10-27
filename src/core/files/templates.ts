import * as Y from 'yjs'
import { addChild, setCollapsed } from '../model/commands'
import { addTag, setLink, setNote, toggleMarkOn } from '../model/content'
import { createMapDoc, ensureRoot, type MapDoc } from '../model/doc'
import { addRelationship } from '../model/objectCommands'
import { setSetting } from '../settings'
import { fileLink } from '../links'

/** Which starting point to create a file from. */
export type StarterKind = 'blank' | 'kb' | 'sample-kb'

const encode = (doc: MapDoc) => Y.encodeStateAsUpdate(doc.ydoc)

/** A new knowledge base: a central topic with branches for the usual kinds of content. */
function knowledgeBase(doc: MapDoc, title = 'Knowledge base') {
  const root = ensureRoot(doc, title)
  const concepts = addChild(doc, root, 'Concepts')
  const resources = addChild(doc, root, 'Resources')
  const projects = addChild(doc, root, 'Projects')
  const notes = addChild(doc, root, 'Notes')
  return { root, concepts, resources, projects, notes }
}

function sampleKnowledgeBase(doc: MapDoc) {
  const { root, concepts, resources, projects, notes } = knowledgeBase(doc, 'Example knowledge base')
  const mm = addChild(doc, concepts, 'Mind maps')
  const kb = addChild(doc, concepts, 'Knowledge bases')
  const links = addChild(doc, concepts, 'Links between notes')
  setNote(doc, mm, '<h2>Mind maps</h2><p>A mind map shows how ideas connect. Start with one central topic and branch outwards.</p>')
  setNote(doc, kb, '<p>A <strong>knowledge base</strong> is a mind map used to keep connected notes: every topic can hold a note, tags, links and files.</p>')
  setNote(doc, links, '<p>Select a topic, open <em>Details</em> and choose <em>Link to a map or knowledge base</em>. The other side then shows a backlink.</p>')
  addTag(doc, [mm, kb, links], 'concept')
  toggleMarkOn(doc, [kb], 'e:💡')
  const book = addChild(doc, resources, 'Reading list')
  addChild(doc, resources, 'Useful websites')
  setLink(doc, book, 'https://example.com/')
  addTag(doc, [book], 'reading')
  const launch = addChild(doc, projects, 'Plan the first project')
  addChild(doc, projects, 'Review next week')
  toggleMarkOn(doc, [launch], 'p:1')
  addTag(doc, [launch], 'project')
  addChild(doc, notes, 'Ideas to explore')
  addChild(doc, notes, 'Questions')
  addRelationship(doc, mm, kb)
  setCollapsed(doc, [notes], false)
  return root
}

/** Content for a new file as a saved document. */
export function buildStarterContent(kind: StarterKind): Uint8Array {
  const doc = createMapDoc()
  if (kind === 'kb') knowledgeBase(doc)
  else if (kind === 'sample-kb') {
    sampleKnowledgeBase(doc)
    setSetting(doc, 'numbering', false)
  } else ensureRoot(doc, 'Central Topic')
  return encode(doc)
}

/** A topic that links to another file, for building cross-linked examples and tests. */
export function linkedTopicContent(text: string, targetFileId: string): Uint8Array {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  const t = addChild(doc, root, text)
  setLink(doc, t, fileLink(targetFileId))
  return encode(doc)
}
