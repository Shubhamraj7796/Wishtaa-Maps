import type { Topic } from './types'

/** A topic as stored in the document (map id is implied by the document). */
export type TopicData = Omit<Topic, 'mapId'>

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
    ...p,
  }
}
