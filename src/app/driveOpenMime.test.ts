import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDrive } from '@/core/drive/fakeDrive'
import { packFile } from '@/core/drive/format'
import { basicShapes, simple } from '@/core/import/emmx/testkit'
import { inspectPicked, type OpenDeps } from './driveOpen'

/**
 * Drive gives a file uploaded from a computer an unpredictable type, and the Picker cannot filter by extension. So the Picker lists
 * every file and each pick is checked by name, then by content.
 */
let drive: FakeDrive
let openFromDrive: ReturnType<typeof vi.fn>
let deps: OpenDeps
beforeEach(() => {
  drive = new FakeDrive()
  openFromDrive = vi.fn()
  deps = { api: drive, repo: { openFromDrive: openFromDrive as never, findConverted: async () => null } }
})

const emmx = () => simple(basicShapes())
const pick = (id: string) => ({ id, name: 'ignored by the check', mimeType: undefined })
const MIMES: [string, string][] = [
  ['application/octet-stream', 'application/octet-stream'],
  ['application/zip', 'application/zip'],
  ['application/x-zip-compressed', 'application/x-zip-compressed'],
  ['empty', ''],
  ['a vendor type', 'application/vnd.edrawsoft.emmx'],
]

describe('an .emmx is accepted whatever type Drive gave it', () => {
  for (const [label, mime] of MIMES) {
    it(`type: ${label}`, async () => {
      const f = drive.seedBytes('IND AS 2.emmx', emmx(), mime)
      const [r] = await inspectPicked([pick(f.id)], deps)
      expect(r).toMatchObject({ status: 'ok', kind: 'emmx', name: 'IND AS 2.emmx' })
    })
  }

  it('the name may be in capitals', async () => {
    const f = drive.seedBytes('IND AS 16.EMMX', emmx(), 'application/octet-stream')
    expect((await inspectPicked([pick(f.id)], deps))[0]).toMatchObject({ status: 'ok', kind: 'emmx' })
  })
})

describe('a file whose name has no .emmx or .wishtaa is looked at inside', () => {
  for (const [label, mime] of MIMES) {
    it(`an .emmx with no extension, type: ${label}`, async () => {
      const f = drive.seedBytes('IND AS 38 Intangible Assets', emmx(), mime)
      expect((await inspectPicked([pick(f.id)], deps))[0]).toMatchObject({ status: 'ok', kind: 'emmx' })
    })
  }

  it('a .wishtaa with no extension (its JSON says it is ours)', async () => {
    const text = await packFile({ type: 'map', name: 'x', createdAt: 1, modifiedAt: 2, content: new Uint8Array([1]) })
    const f = await drive.create({ name: 'My notes', parentId: await drive.ensureAppFolder(), body: text })
    const stored = drive.files.get(f.id)
    if (stored) stored.meta.mimeType = 'application/octet-stream' // Drive typed it as anything
    expect((await inspectPicked([pick(f.id)], deps))[0]).toMatchObject({ status: 'ok', kind: 'wishtaa' })
  })
})

describe('anything else is turned away with a friendly message, and nothing is imported', () => {
  const friendly = /This file isn't a \.wishtaa or \.emmx mind map/

  it('a .pdf and a .docx are rejected without being downloaded', async () => {
    const pdf = drive.seedBytes('Report.pdf', strToU8('%PDF-1.7'), 'application/pdf')
    const docx = drive.seedBytes('Plan.docx', strToU8('PK'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    drive.calls.length = 0
    const out = await inspectPicked([pick(pdf.id), pick(docx.id)], deps)
    for (const r of out) {
      expect(r.status).toBe('rejected')
      expect((r as { reason: string }).reason).toMatch(friendly)
    }
    expect(drive.calls.some((c) => c.startsWith('downloadBytes'))).toBe(false)
    expect(openFromDrive).not.toHaveBeenCalled()
  })

  it('a Word file or a PDF that Drive typed as octet-stream is rejected by what is inside it', async () => {
    const word = zipSync({ 'word/document.xml': strToU8('<w/>'), '[Content_Types].xml': strToU8('<t/>') })
    const a = drive.seedBytes('Plan.docx', word, 'application/octet-stream')
    const b = drive.seedBytes('scan', strToU8('%PDF-1.4 ...'), '')
    const c = drive.seedBytes('notes.txt', strToU8('just some words'), 'application/octet-stream')
    const out = await inspectPicked([pick(a.id), pick(b.id), pick(c.id)], deps)
    expect(out.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected'])
    for (const r of out) expect((r as { reason: string }).reason).toMatch(friendly)
  })

  it('one bad pick never blocks the good ones', async () => {
    const good = drive.seedBytes('A.emmx', emmx(), 'application/zip')
    const bad = drive.seedBytes('Report.pdf', strToU8('%PDF'), 'application/pdf')
    const out = await inspectPicked([pick(bad.id), pick(good.id)], deps)
    expect(out.map((r) => r.status)).toEqual(['rejected', 'ok'])
  })

  it('a huge file with no extension is not downloaded to be sniffed', async () => {
    const f = drive.seedBytes('big', strToU8('x'), 'application/octet-stream')
    const stored = drive.files.get(f.id)
    if (stored) stored.meta.size = String(60 * 1024 * 1024)
    drive.calls.length = 0
    expect((await inspectPicked([pick(f.id)], deps))[0]?.status).toBe('rejected')
    expect(drive.calls.some((c) => c.startsWith('downloadBytes'))).toBe(false)
  })
})
