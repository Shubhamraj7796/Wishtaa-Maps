import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { basicShapes, simple } from '@/core/import/emmx/testkit'
import { parseEmmx } from '@/core/import/emmx/parse'
import { MemoryImageStore } from '@/core/images/store'
import { importEmmx, type PickedFile } from './importEmmx'

/** A map imported from "IND AS 116 Leases.emmx" is called "IND AS 116 Leases": spaces and punctuation in file names are kept. */
const small = simple(basicShapes())
const asFile = (name: string, bytes: Uint8Array = small): PickedFile => ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer })
const nameOf = async (file: string) => {
  const repo = new RepositoryCore(new MemoryBackend(), () => Date.now())
  const out = await importEmmx(asFile(file), { repo, images: new MemoryImageStore(), parentId: null })
  expect(out.error).toBeUndefined()
  return out.files[0]?.record.name
}

describe('the map is named after the file', () => {
  it('keeps the spaces', async () => {
    expect(await nameOf('IND AS 116 Leases.emmx')).toBe('IND AS 116 Leases')
    expect(await nameOf('IND AS 2.emmx')).toBe('IND AS 2')
    expect(await nameOf('IND AS 38 Intangible Assts.emmx')).toBe('IND AS 38 Intangible Assts')
  })

  it('keeps brackets, dots, several words, accents and a capital extension', async () => {
    expect(await nameOf('My  Map (v2).emmx')).toBe('My Map (v2)') // a double space becomes one
    expect(await nameOf('a.b.c notes.emmx')).toBe('a.b.c notes')
    expect(await nameOf('Résumé notes.EMMX')).toBe('Résumé notes')
  })

  it('a file with no usable name gets a plain one', async () => {
    expect(await nameOf('.emmx')).toBe('Imported map')
  })
})

describe('a binary page (IND AS 116): the central topic reads "IND AS 116 Leases"', () => {
  it('the page is named from all of the central topic, with a space between its lines', async () => {
    const r = await parseEmmx(new Uint8Array(readFileSync('tests/fixtures/IND_AS_116.emmx')))
    expect(r.maps[0]?.name).toBe('IND AS 116 Leases')
    expect(r.maps[0]?.root.text).toBe('IND AS 116\nLeases') // the topic itself keeps its two lines
  })
})
