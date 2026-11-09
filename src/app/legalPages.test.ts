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

  it('can be indexed by search engines, name the app exactly, and show where the contact email goes', () => {
    for (const [name, html] of [['privacy', privacy], ['terms', terms]] as const) {
      expect(html).not.toMatch(/noindex/i)
      expect(html).toContain(`<link rel="canonical" href="https://maps.wishtaa.com/${name}">`)
      expect(html).toMatch(/<title>[^<]*- Wishtaa Maps<\/title>/)
      expect(html).toMatch(/Contact:[^<]*<mark>\[contact email: fill in\]<\/mark>/)
    }
  })

  it('robots.txt allows them and the sitemap lists them', () => {
    expect(readFileSync('public/robots.txt', 'utf8')).toMatch(/Allow: \/privacy[\s\S]*Allow: \/terms[\s\S]*Sitemap: https:\/\/maps\.wishtaa\.com\/sitemap\.xml/)
    const map = readFileSync('public/sitemap.xml', 'utf8')
    expect(map).toContain('https://maps.wishtaa.com/privacy')
    expect(map).toContain('https://maps.wishtaa.com/terms')
  })
})
