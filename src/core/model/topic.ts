import type { Topic } from './types'

/** Reference to an image blob in the image store, with the size it is displayed at. */
export interface TopicImage {
  imageId: string
  width: number
  height: number
}

/** A topic as stored in the document (map id is implied by the document). */
export type TopicData = Omit<Topic, 'mapId'> & {
  /** Optional so maps saved before images existed still load. */
  image?: TopicImage | null
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
    ...p,
  }
}
