// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readRef, REF_KEY } from '@/core/referral/capture'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { captureReferralLink } from './account'

beforeEach(() => installMemoryLocalStorage())

afterEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

describe('opening a friend link', () => {
  it('remembers the code, and removes only ref from the address bar', () => {
    history.replaceState(null, '', '/?ref=abcd2345&utm=x#top')
    captureReferralLink()
    expect(readRef(localStorage)).toBe('ABCD2345')
    expect(location.search).toBe('?utm=x')
    expect(location.hash).toBe('#top')
  })

  it('a page with no ref changes nothing', () => {
    history.replaceState(null, '', '/home?code=google-return')
    captureReferralLink()
    expect(localStorage.getItem(REF_KEY)).toBeNull()
    expect(location.search).toBe('?code=google-return')
  })

  it('a broken code is dropped from the address and never stored', () => {
    history.replaceState(null, '', '/?ref=not-a-code')
    captureReferralLink()
    expect(localStorage.getItem(REF_KEY)).toBeNull()
    expect(location.search).toBe('')
  })
})
