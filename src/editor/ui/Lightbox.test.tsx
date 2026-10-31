// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Lightbox, mapImageIds } from './Dialogs'
import { useEditor } from '../store'

vi.mock('../images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../images')>()),
  useImageUrl: (id: string) => ({ url: `blob:${id}`, missing: false }),
}))
vi.mock('../scene', () => ({ useScene: () => ({ order: ['a', 'b', 'c', 'd'] }) }))

const withImage = (id: string, imageId: string | null) => ({ id, image: imageId ? { imageId } : null })

beforeEach(() => {
  act(() =>
    useEditor.setState({
      topics: { a: withImage('a', 'img1'), b: withImage('b', null), c: withImage('c', 'img2'), d: withImage('d', 'img1') } as never,
      lightbox: 'img1',
    })
  )
})
afterEach(() => {
  cleanup()
  act(() => useEditor.setState({ lightbox: null }))
})

describe('the picture viewer', () => {
  it('lists each picture once, in reading order', () => {
    expect(mapImageIds(useEditor.getState().topics as never, ['a', 'b', 'c', 'd'])).toEqual(['img1', 'img2'])
  })

  it('goes to the next and previous picture, wrapping round', () => {
    render(<Lightbox />)
    expect(screen.getByText('1 of 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }))
    expect(useEditor.getState().lightbox).toBe('img2')
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }))
    expect(useEditor.getState().lightbox).toBe('img1')
    fireEvent.click(screen.getByRole('button', { name: 'Previous picture' }))
    expect(useEditor.getState().lightbox).toBe('img2')
  })

  it('works with the arrow keys and closes with Esc', () => {
    render(<Lightbox />)
    const dialog = screen.getByRole('dialog', { name: 'Picture preview' })
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(useEditor.getState().lightbox).toBe('img2')
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    expect(useEditor.getState().lightbox).toBe('img1')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(useEditor.getState().lightbox).toBeNull()
  })

  it('zooms in and out in steps, and resets', () => {
    render(<Lightbox />)
    const percent = () => screen.getByRole('button', { name: 'Actual size' }).textContent
    expect(percent()).toBe('100%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(percent()).toBe('150%')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '+' })
    expect(percent()).toBe('200%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(percent()).toBe('75%')
    fireEvent.click(screen.getByRole('button', { name: 'Actual size' }))
    expect(percent()).toBe('100%')
  })

  it('with one picture there is nothing to step to', () => {
    act(() => useEditor.setState({ topics: { a: withImage('a', 'img1') } as never }))
    render(<Lightbox />)
    expect((screen.getByRole('button', { name: 'Next picture' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
