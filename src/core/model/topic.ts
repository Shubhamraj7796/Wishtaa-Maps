import type { Topic } from './types'

/** Layout direction a single branch can use instead of the map's layout. */
export type BranchDir = 'right' | 'left' | 'down' | 'up' | 'stack'
export const BRANCH_DIRS: BranchDir[] = ['right', 'left', 'down', 'up', 'stack']

/** Reference to an image blob in the image store, with the size it is displayed at. */
export type ImagePosition = 'above' | 'below' | 'left' | 'right' | 'behind'
export const IMAGE_POSITIONS: ImagePosition[] = ['above', 'below', 'left', 'right', 'behind']

export interface TopicImage {
  imageId: string
  width: number
  height: number
  /** Where the picture sits relative to the text (default: above). */
  position?: ImagePosition
  /** Text read out to people who cannot see the picture. Unset = the topic's text. */
  alt?: string
}

/** A file attached to a topic; the bytes live in the attachment store. */
export interface Attachment {
  id: string
  name: string
  size: number
  type: string
}

/** A topic as stored in the document (map id is implied by the document). */
export type TopicData = Omit<Topic, 'mapId'> & {
  /** Optional so maps saved before images existed still load. */
  image?: TopicImage | null
  /** Short note shown under the topic text. */
  inlineNote?: string
  /** LaTeX formula shown inside the topic. */
  latex?: string | null
  /** Small table shown inside the topic (rows of cell text). */
  table?: string[][] | null
  attachments?: Attachment[]
  /** Per-branch layout override (this topic's own descendants). */
  branchDir?: BranchDir | null
  /** For a main topic (child of the central topic): which side it sits on in the balanced mind map. Unset = automatic. */
  side?: 'left' | 'right' | null
  /** Manual shift of this branch from its automatic position (branch free positioning). */
  offset?: { x: number; y: number } | null
}

export function makeTopic(
  p: Pick<TopicData, 'id' | 'parentId' | 'order'> & Partial<TopicData>
): TopicData {
  return {
    text: '',
    collapsed: false,
    style: {},
    marks: [],
    note: '',
    tags: [],
    task: null,
    link: null,
    floatingPosition: null,
    image: null,
    inlineNote: '',
    latex: null,
    table: null,
    attachments: [],
    ...p,
  }
}
