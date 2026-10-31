/**
 * EdrawMind 10 and newer save a page as a compact BINARY file, `mmpage/<name>.bin`, instead of `page/<name>.xml`. The format is not
 * documented. This reader was worked out from real files (IND AS 116) and understands only what it could check:
 *
 *   - a topic record starts   `01 <id> 02 <len> 04 01`   (id is a variable-length number; `len` is 0x10 to 0x7f). The branch
 *     connectors between topics look alike but go on `04 01 80 80`; they are skipped
 *   - its text is one or more `02 <style> 04 <UTF-8 text> 00` paragraphs
 *   - its parent topic is     `00 08 <id>`   after the text
 *   - its picture is a nested record `01 <id> 02 19 31 <n>` where n is the picture's number in `rels/<name>_formats.xml`
 *
 * What it does not read: colours, shapes, line styles and positions. Anything that does not fit the patterns is ignored, never
 * guessed at, and a file with no topic record at all is refused with a clear message by the caller.
 */

export interface BinTopic {
  id: number
  /** The parent's id, or null when none was found (the first topic is the central topic). */
  parent: number | null
  /** One entry per paragraph. */
  paragraphs: string[]
  /** The picture's number (1, 2, 3...) as listed in the page's relationships, if the topic has one. */
  picture: number | null
}

const MAX_TOPICS = 100_000
const decoder = new TextDecoder('utf-8', { fatal: true })

/** Reads a variable-length number (7 bits per byte, the high bit says more follow). Returns null when it is not one. */
function varint(b: Uint8Array, i: number): { value: number; end: number } | null {
  let value = 0
  let shift = 0
  for (let n = 0; n < 4; n++) {
    const c = b[i + n]
    if (c === undefined) return null
    value += (c & 0x7f) * 2 ** shift
    shift += 7
    if (!(c & 0x80)) return { value, end: i + n + 1 }
  }
  return null
}

interface Mark {
  kind: 'topic' | 'picture' | 'connector'
  pos: number
  id: number
  /** For a picture: its number. For a topic: where its fields begin. */
  n: number
}

/** True when `s` is text a person could have typed: no control characters other than a tab or a line break. */
const plain = (s: string) => {
  if (!s.length) return false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127) return false
  }
  return true
}

function textsIn(b: Uint8Array, from: number, to: number): { paragraphs: string[]; end: number } {
  const paragraphs: string[] = []
  let end = from
  // `02 <style: 1 to 3 bytes> 04 <text> 00`; the first text byte is printable, which sets it apart from `04 01` (a flag).
  for (let i = from; i < to - 4; i++) {
    if (b[i] !== 0x02) continue
    let j = i + 1
    let styleBytes = 0
    while (styleBytes < 3 && j < to && (b[j] as number) & 0x80) {
      j++
      styleBytes++
    }
    if (styleBytes > 2 || j >= to || (b[j] as number) & 0x80) continue
    j++ // the last byte of the style number
    if (b[j] !== 0x04 || (b[j + 1] as number) < 0x20) continue
    const start = j + 1
    let stop = start
    while (stop < to && b[stop] !== 0) stop++
    if (stop >= to || stop - start > 5000) continue
    try {
      const s = decoder.decode(b.subarray(start, stop))
      if (!plain(s)) continue
      paragraphs.push(s)
      end = stop + 1
      i = stop
    } catch {
      /* not text */
    }
  }
  return { paragraphs, end }
}

/** The topics of a binary page, in the order they were saved (the central topic first). */
export function parseBinaryPage(b: Uint8Array): BinTopic[] {
  const marks: Mark[] = []
  for (let i = 0; i + 8 < b.length; i++) {
    if (b[i] !== 0x01) continue
    const id = varint(b, i + 1)
    if (!id || id.value === 0) continue
    const j = id.end
    if (b[j] !== 0x02) continue
    if (b[j + 1] === 0x19 && b[j + 2] === 0x31 && (b[j + 3] as number) > 0 && (b[j + 3] as number) < 0x80) {
      marks.push({ kind: 'picture', pos: i, id: id.value, n: b[j + 3] as number })
      i = j + 3
    } else if ((b[j + 1] as number) >= 0x10 && (b[j + 1] as number) <= 0x7f && b[j + 2] === 0x04 && b[j + 3] === 0x01) {
      // `04 01 80 80` is a branch connector: it has no text and ends the topic before it, but it is not a topic.
      const connector = b[j + 4] === 0x80 && b[j + 5] === 0x80
      marks.push({ kind: connector ? 'connector' : 'topic', pos: i, id: id.value, n: j + 2 })
    }
  }

  const topics: BinTopic[] = []
  const seen = new Set<number>()
  for (let m = 0; m < marks.length && topics.length < MAX_TOPICS; m++) {
    const mark = marks[m] as Mark
    if (mark.kind !== 'topic' || seen.has(mark.id)) continue
    // This topic's bytes run to the next record of any kind.
    const stop = marks[m + 1]?.pos ?? b.length
    const { paragraphs, end } = textsIn(b, mark.n, stop)
    let parent: number | null = null
    for (let i = end; i + 2 < stop; i++) {
      if (b[i] === 0x00 && b[i + 1] === 0x08) {
        const p = varint(b, i + 2)
        if (p && p.value > 0 && p.value !== mark.id) {
          parent = p.value
          break
        }
      }
    }
    // The topic's picture is the first picture record before the next topic.
    let picture: number | null = null
    for (let k = m + 1; k < marks.length && (marks[k] as Mark).kind !== 'topic'; k++) {
      if ((marks[k] as Mark).kind === 'picture') {
        picture = (marks[k] as Mark).n
        break
      }
    }
    seen.add(mark.id)
    topics.push({ id: mark.id, parent, paragraphs, picture })
  }
  return topics
}
