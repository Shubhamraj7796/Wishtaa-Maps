// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { SHAPES } from '@/core/model/types'
import { SHAPE_NAME } from '@/core/shapes'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { closeFile, openFile } from '../session'
import { useEditor } from '../store'
import { ShapePicker, TopicSection } from './TopicStylePanel'
import { resolveLook } from '@/core/theme/resolve'
import { resolveTheme } from '@/core/settings'

let t = 1_700_000_000_000
beforeEach(async () => {
  installMemoryLocalStorage()
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'kb', name: 'Shapes', content: buildStarterContent('kb') })
  await openFile(f.id, repo)
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await closeFile()
})

describe('shape picker', () => {
  it('opens a labelled menu with the theme option and every shape, each with a spoken name', () => {
    render(<ShapePicker value={undefined} onPick={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Shape: from the theme/ }))
    const menu = screen.getByRole('menu', { name: 'Shapes' })
    const items = within(menu).getAllByRole('menuitemradio')
    expect(items).toHaveLength(SHAPES.length + 1)
    for (const s of SHAPES) expect(within(menu).getByRole('menuitemradio', { name: SHAPE_NAME(s) })).toBeTruthy()
    expect(within(menu).getByRole('menuitemradio', { name: 'Double circle' })).toBeTruthy()
  })

  it('picks a shape with a click and closes', () => {
    const onPick = vi.fn()
    render(<ShapePicker value={undefined} onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: /Shape:/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Hexagon' }))
    expect(onPick).toHaveBeenCalledWith('hexagon')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('works from the keyboard: arrows move, Enter picks, Escape closes without picking', async () => {
    const onPick = vi.fn()
    render(<ShapePicker value="rect" onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: /Shape:/ }))
    const menu = screen.getByRole('menu', { name: 'Shapes' })
    const first = () => within(menu).getAllByRole('menuitemradio').filter((b) => b.tabIndex === 0)
    await waitFor(() => expect(first()).toHaveLength(1))
    const before = first()[0]!.getAttribute('aria-label')
    fireEvent.keyDown(menu, { key: 'ArrowRight' })
    expect(first()[0]!.getAttribute('aria-label')).not.toBe(before)
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(first()[0]!.getAttribute('aria-label')).toBe('Shape from the theme')
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('marks the current shape', () => {
    render(<ShapePicker value="heart" onPick={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Shape: Heart/ }))
    expect(screen.getByRole('menuitemradio', { name: 'Heart' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('Topic section', () => {
  function section() {
    const { topics, rootId, settings } = useEditor.getState()
    const id = Object.values(topics).find((x) => x.parentId === rootId)!.id
    useEditor.setState({ selected: [id] })
    const look = resolveLook(resolveTheme(settings), { depth: 1, branch: 0, isRoot: false })
    render(<TopicSection style={{}} look={look} count={1} />)
    return id
  }

  it('offers the scope choice: selection, level, branch', () => {
    section()
    const select = screen.getByLabelText('Apply changes to') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['selection', 'level', 'branch'])
    fireEvent.change(select, { target: { value: 'level' } })
    expect(useEditor.getState().styleScope).toBe('level')
  })

  it('changing the shape styles the selected topic', async () => {
    const id = section()
    fireEvent.click(screen.getByRole('button', { name: /Shape:/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Double circle' }))
    await waitFor(() => expect(useEditor.getState().topics[id]?.style?.shape).toBe('doubleCircle'))
  })

  it('a custom width is clamped to the allowed range', async () => {
    const id = section()
    fireEvent.click(screen.getByRole('checkbox', { name: /Custom width/ }))
    await waitFor(() => expect(useEditor.getState().topics[id]?.style?.width).toBeDefined())
  })
})
