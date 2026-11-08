import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = (name: string) => readFileSync(`public/${name}/index.html`, 'utf8')

describe('privacy and terms pages (static drafts)', () => {
  const privacy = page('privacy')
  const terms = page('terms')

  it('are clearly marked as drafts with blanks for the owner to fill in', () => {
    for (const html of [privacy, terms]) {
      expect(html).toMatch(/DRAFT, not yet reviewed/)
      expect(html).toMatch(/<mark>\[contact email: fill in\]<\/mark>/)
      expect(html).toMatch(/<meta name="viewport"/)
    }
  })

  it('privacy says what is stored, what is not, the drive.file scope, and what deleting an account does', () => {
    expect(privacy).toMatch(/Your maps and pictures are not stored on our servers/)
    expect(privacy).toMatch(/<code>drive\.file<\/code>/)
    expect(privacy).toMatch(/only the files it creates, or that you pick/)
    expect(privacy).toMatch(/does not delete your files in Google Drive/)
    expect(privacy).toMatch(/Limited Use/)
    for (const word of ['Supabase', 'Vercel', 'Turnstile', 'Recent files']) expect(privacy).toContain(word)
  })

  it('terms say the content is the user\'s and Drive files survive account deletion', () => {
    expect(terms).toMatch(/<strong>yours<\/strong>/)
    expect(terms).toMatch(/does not delete your files in Drive/)
  })

  it('link to each other and back to the app', () => {
    expect(privacy).toContain('href="/terms"')
    expect(terms).toContain('href="/privacy"')
    expect(privacy).toContain('href="/"')
  })
})
