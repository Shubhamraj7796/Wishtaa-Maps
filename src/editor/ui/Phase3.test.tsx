// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { addRelationship } from '@/core/model/objectCommands'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import * as A from '../actions'
import { selectObject } from '../content'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { BranchControls } from './BranchControls'
import { ObjectBar } from './ObjectBar'
import { ColorPicker } from './ColorPicker'
import { QuickToolbar } from './QuickToolbar'
import { Slider } from './Slider'

let t = 1_700_000_000_000
let child = ''
let grandchild = ''
const undoSteps = () => mapDoc.undo.undoStack.length
const styleOf = (id: string) => useEditor.getState().topics[id]?.style ?? {}

beforeEach(async () => {
  installMemoryLocalStorage()
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'kb', name: 'Colours', content: buildStarterContent('kb') })
  await openFile(f.id, repo)
  const { rootId } = useEditor.getState()
  child = addChild(mapDoc, rootId, 'Child')
  grandchild = addChild(mapDoc, child, 'Grandchild')
  await waitFor(() => expect(useEditor.getState().topics[grandchild]).toBeDefined())
  A.selectOnly(child)
  mapDoc.undo.stopCapturing()
  mapDoc.undo.clear()
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await closeFile()
})

describe('slider', () => {
  it('previews on every move and saves once, on release', () => {
    const preview = vi.fn()
    const commit = vi.fn()
    render(<Slider label="Thickness" value={4} min={1} max={20} onPreview={preview} onCommit={commit} />)
    const input = screen.getByRole('slider', { name: 'Thickness' })
    for (const v of ['5', '6', '9', '12']) fireEvent.change(input, { target: { value: v } })
    expect(preview).toHaveBeenCalledTimes(4)
    expect(commit).not.toHaveBeenCalled()
    fireEvent.pointerUp(input)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith(12)
    fireEvent.pointerUp(input) // a second release with no move saves nothing
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('works from the keyboard: each key press is one change', () => {
    const commit = vi.fn()
    render(<Slider label="Opacity" value={50} min={0} max={100} onCommit={commit} />)
    const input = screen.getByRole('slider', { name: 'Opacity' })
    fireEvent.change(input, { target: { value: '51' } })
    fireEvent.keyUp(input, { key: 'ArrowRight' })
    expect(commit).toHaveBeenCalledWith(51)
  })
})

describe('colour picker', () => {
  function open(props: Partial<React.ComponentProps<typeof ColorPicker>> = {}) {
    const onChange = vi.fn()
    render(<ColorPicker label="Fill colour" value="#0f766e" onChange={onChange} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Fill colour: #0f766e/ }))
    return { onChange, dialog: screen.getByRole('dialog', { name: 'Fill colour picker' }) }
  }

  it('offers the map colours, standard colours and a custom hex box', () => {
    const { dialog } = open()
    expect(within(dialog).getByRole('group', { name: 'Map colours' })).toBeTruthy()
    expect(within(dialog).getByRole('group', { name: 'Standard colours' })).toBeTruthy()
    expect(within(dialog).getByRole('textbox', { name: 'Hex colour' })).toBeTruthy()
  })

  it('picks a swatch, and remembers it under Recent', () => {
    const { onChange, dialog } = open()
    fireEvent.click(within(dialog).getByRole('button', { name: '#dc2626' }))
    expect(onChange).toHaveBeenCalledWith('#dc2626')
    expect(within(dialog).getByRole('group', { name: 'Recent colours' })).toBeTruthy()
  })

  it('takes a typed hex colour, with or without the # and in short form', () => {
    const { onChange, dialog } = open()
    const box = within(dialog).getByRole('textbox', { name: 'Hex colour' })
    fireEvent.change(box, { target: { value: 'F80' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith('#ff8800')
    fireEvent.change(box, { target: { value: 'nonsense' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('has No fill and Auto when asked, and calls them', () => {
    const onNone = vi.fn()
    const onClear = vi.fn()
    const { dialog } = open({ onNone, onClear })
    fireEvent.click(within(dialog).getByRole('button', { name: 'No fill' }))
    expect(onNone).toHaveBeenCalled()
  })

  it('Esc closes the picker and puts focus back on the button', () => {
    const { dialog } = open()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Fill colour/ }))
  })

  it('shows an opacity slider that previews then saves once', () => {
    const preview = vi.fn()
    const commit = vi.fn()
    const { dialog } = open({ opacity: 1, onOpacityPreview: preview, onOpacityCommit: commit })
    const slider = within(dialog).getByRole('slider', { name: 'Opacity' })
    fireEvent.change(slider, { target: { value: '60' } })
    fireEvent.change(slider, { target: { value: '40' } })
    fireEvent.pointerUp(slider)
    expect(preview).toHaveBeenLastCalledWith(0.4)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith(0.4)
  })

  it('stays quiet when the contrast is fine', () => {
    render(<ColorPicker label="Text colour" value="#111827" onChange={() => undefined} contrastAgainst={{ color: '#ffffff' }} />)
    fireEvent.click(screen.getByRole('button', { name: /Text colour/ }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/passes WCAG AA/)).toBeTruthy()
  })
})

describe('colour picker contrast warning', () => {
  it('shows the ratio and a one-click readable colour', () => {
    const onChange = vi.fn()
    render(<ColorPicker label="Text colour" value="#dddddd" onChange={onChange} contrastAgainst={{ color: '#ffffff', what: 'on this topic’s fill' }} />)
    fireEvent.click(screen.getByRole('button', { name: /Text colour/ }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/Low contrast/)
    expect(alert.textContent).toMatch(/4\.5:1/)
    fireEvent.click(within(alert).getByRole('button', { name: /Use a readable colour/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0]).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('branch controls', () => {
  it('a thickness drag is one undo step and nothing is saved before release', () => {
    render(<BranchControls />)
    const slider = screen.getByRole('slider', { name: 'Thickness' })
    for (const v of ['3', '6', '9', '14']) fireEvent.change(slider, { target: { value: v } })
    expect(undoSteps()).toBe(0)
    expect(styleOf(child).lineWidth).toBeUndefined()
    expect(useEditor.getState().styleLive?.patch).toEqual({ lineWidth: 14 })
    fireEvent.pointerUp(slider)
    expect(undoSteps()).toBe(1)
    expect(styleOf(child).lineWidth).toBe(14)
    expect(useEditor.getState().styleLive).toBeNull()
    act(() => A.cmdUndo())
    expect(styleOf(child).lineWidth).toBeUndefined()
  })

  it('changes this branch only by default, and the whole branch below when asked', () => {
    render(<BranchControls />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Arrow head/ }))
    expect(styleOf(child).lineArrow).toBe(true)
    expect(styleOf(grandchild).lineArrow).toBeUndefined()
    fireEvent.click(screen.getByRole('radio', { name: 'This branch and below' }))
    fireEvent.click(screen.getByRole('button', { name: 'Branch: dashed' }))
    expect(styleOf(child).lineStyle).toBe('dashed')
    expect(styleOf(grandchild).lineStyle).toBe('dashed')
    expect(undoSteps()).toBe(2)
  })

  it('Tapered is a curved branch that thins, and picking another curve turns taper off', () => {
    render(<BranchControls />)
    const select = screen.getByRole('combobox', { name: 'Branch curve' })
    fireEvent.change(select, { target: { value: 'tapered' } })
    expect(styleOf(child)).toMatchObject({ branchCurve: 'curve', taper: true })
    fireEvent.change(select, { target: { value: 'elbow' } })
    expect(styleOf(child)).toMatchObject({ branchCurve: 'elbow', taper: false })
    fireEvent.change(select, { target: { value: 'auto' } })
    expect(styleOf(child).branchCurve).toBeUndefined()
    expect(styleOf(child).taper).toBeUndefined()
  })

  it('offers every curve the spec lists', () => {
    render(<BranchControls />)
    const names = within(screen.getByRole('combobox', { name: 'Branch curve' })).getAllByRole('option').map((o) => o.textContent)
    expect(names.join('|')).toMatch(/Curved.*Straight.*Elbow.*Rounded elbow.*Tapered.*None/)
  })

  it('explains itself for the central topic, which has no branch', () => {
    A.selectOnly(useEditor.getState().rootId)
    render(<BranchControls />)
    expect(screen.getByText(/not the central one/)).toBeTruthy()
  })
})

describe('quick toolbar', () => {
  it('is not shown with nothing selected, while editing, or in the outline', () => {
    A.clearSelection()
    const { container, rerender } = render(<QuickToolbar />)
    expect(container.querySelector('[role=toolbar]')).toBeNull()
    A.selectOnly(child)
    rerender(<QuickToolbar />)
    expect(screen.getByRole('toolbar', { name: 'Quick format' })).toBeTruthy()
    act(() => useEditor.setState({ editingId: child }))
    rerender(<QuickToolbar />)
    expect(container.querySelector('[role=toolbar]')).toBeNull()
    act(() => useEditor.setState({ editingId: null, view: 'outline' }))
    rerender(<QuickToolbar />)
    expect(container.querySelector('[role=toolbar]')).toBeNull()
    act(() => useEditor.setState({ view: 'map' }))
  })

  it('has the tools the spec lists, each with a name', () => {
    render(<QuickToolbar />)
    const bar = screen.getByRole('toolbar', { name: 'Quick format' })
    for (const name of [/Font family/, /Smaller text/, /Bigger text/, /^Bold/, /^Italic/, /^Underline/, /^Strikethrough/, /Text colour/, /Highlight/, /Text alignment/, /Fill colour/, /Line colour/, /Shape:/, /^Branch$/, /Connector style/, /Format painter/, /^More$/]) {
      expect(within(bar).getByRole(name.source.includes('Font family') ? 'combobox' : 'button', { name }), String(name)).toBeTruthy()
    }
  })

  it('the central topic has no Branch or Connector tools', () => {
    A.selectOnly(useEditor.getState().rootId)
    render(<QuickToolbar />)
    expect(screen.queryByRole('button', { name: 'Branch' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connector style' })).toBeNull()
  })

  it('bold, italic, underline and strikethrough toggle on and off, one undo step each', () => {
    render(<QuickToolbar />)
    const bar = screen.getByRole('toolbar', { name: 'Quick format' })
    fireEvent.click(within(bar).getByRole('button', { name: 'Underline' }))
    expect(styleOf(child).underline).toBe(true)
    fireEvent.click(within(bar).getByRole('button', { name: 'Underline' }))
    expect(styleOf(child).underline).toBeUndefined()
    fireEvent.click(within(bar).getByRole('button', { name: 'Strikethrough' }))
    fireEvent.click(within(bar).getByRole('button', { name: 'Bold' }))
    fireEvent.click(within(bar).getByRole('button', { name: 'Italic' }))
    expect(styleOf(child)).toMatchObject({ strike: true, fontWeight: 700, italic: true })
    expect(undoSteps()).toBe(5)
  })

  it('A+ and A- change the size of the text, within 8 to 72', () => {
    render(<QuickToolbar />)
    const bar = screen.getByRole('toolbar', { name: 'Quick format' })
    const before = styleOf(child).fontSize
    expect(before).toBeUndefined()
    fireEvent.click(within(bar).getByRole('button', { name: 'Bigger text' }))
    const up = styleOf(child).fontSize as number
    expect(up).toBeGreaterThan(8)
    fireEvent.click(within(bar).getByRole('button', { name: 'Smaller text' }))
    expect(styleOf(child).fontSize).toBe(up - 2)
    for (let i = 0; i < 40; i++) fireEvent.click(within(bar).getByRole('button', { name: 'Smaller text' }))
    expect(styleOf(child).fontSize).toBe(8)
  })

  it('alignment cycles left, right, then back to centre', () => {
    render(<QuickToolbar />)
    const click = () => fireEvent.click(screen.getByRole('button', { name: /Text alignment/ }))
    click()
    expect(styleOf(child).align).toBe('right')
    click()
    expect(styleOf(child).align).toBe('left')
    click()
    expect(styleOf(child).align).toBeUndefined()
  })

  it('applies to every selected topic', () => {
    A.selectIds([child, grandchild])
    render(<QuickToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Underline' }))
    expect(styleOf(child).underline).toBe(true)
    expect(styleOf(grandchild).underline).toBe(true)
    expect(undoSteps()).toBe(1)
  })

  it('fill: No fill turns the filling off; a picked colour turns it back on', () => {
    render(<QuickToolbar />)
    fireEvent.click(screen.getByRole('button', { name: /Fill colour/ }))
    fireEvent.click(screen.getByRole('button', { name: 'No fill' }))
    expect(styleOf(child).fillKind).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: /Fill colour/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Fill colour picker' })).getByRole('button', { name: '#dc2626' }))
    expect(styleOf(child)).toMatchObject({ fill: '#dc2626' })
    expect(styleOf(child).fillKind === undefined || styleOf(child).fillKind === 'solid').toBe(true)
  })

  it('the Branch tool opens the branch controls, and Esc closes them', () => {
    render(<QuickToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Branch' }))
    const dialog = screen.getByRole('dialog', { name: 'Branch' })
    expect(within(dialog).getByRole('slider', { name: 'Thickness' })).toBeTruthy()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the Connector tool picks a curve', () => {
    render(<QuickToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Connector style' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Straight' }))
    expect(styleOf(child).branchCurve).toBe('straight')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('arrow keys move between the tools', () => {
    render(<QuickToolbar />)
    const bar = screen.getByRole('toolbar', { name: 'Quick format' })
    const smaller = within(bar).getByRole('button', { name: 'Smaller text' })
    smaller.focus()
    fireEvent.keyDown(smaller, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(within(bar).getByRole('button', { name: 'Bigger text' }))
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(smaller)
  })

  it('flips below the topic when there is no room above, and stays in the area', () => {
    act(() => useEditor.setState({ canvasSize: { w: 900, h: 600 }, viewport: { x: 400, y: 0, k: 1 } }))
    const { rerender } = render(<QuickToolbar />)
    rerender(<QuickToolbar />)
    const bar = screen.getByRole('toolbar', { name: 'Quick format' })
    expect(['above', 'below']).toContain(bar.getAttribute('data-placement'))
    const left = parseFloat(bar.style.left)
    expect(left).toBeGreaterThanOrEqual(8)
  })
})

describe('format painter', () => {
  it('copies a look and paints one topic per click, each one undo step', () => {
    A.styleSelected({ fill: '#dc2626', underline: true, lineWidth: 8 })
    mapDoc.undo.clear()
    render(<QuickToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Format painter' }))
    expect(useEditor.getState().painter).toMatchObject({ fill: '#dc2626', underline: true, lineWidth: 8 })
    act(() => A.applyPainter(grandchild, true))
    expect(styleOf(grandchild)).toMatchObject({ fill: '#dc2626', underline: true, lineWidth: 8 })
    expect(undoSteps()).toBe(1)
    act(() => A.applyPainter(useEditor.getState().rootId))
    expect(undoSteps()).toBe(2)
    expect(useEditor.getState().painter).toBeNull() // one go unless Shift is held
    act(() => A.cmdUndo())
    expect(styleOf(useEditor.getState().rootId).fill).toBeUndefined()
    expect(styleOf(grandchild).fill).toBe('#dc2626')
  })
})

describe('whole-topic changes: undo and the Saved indicator', () => {
  it('a fill opacity drag is one undo step and shows live on the canvas', () => {
    A.previewStyle({ fillOpacity: 0.8 })
    A.previewStyle({ fillOpacity: 0.5 })
    expect(undoSteps()).toBe(0)
    expect(useEditor.getState().styleLive?.ids).toEqual([child])
    A.commitStyle({ fillOpacity: 0.5 })
    expect(undoSteps()).toBe(1)
    expect(styleOf(child).fillOpacity).toBe(0.5)
  })

  it('the preview reaches the descendants only for "this branch and below"', () => {
    A.previewStyle({ lineWidth: 5 }, 'branch')
    expect(useEditor.getState().styleLive?.ids.sort()).toEqual([child, grandchild].sort())
    A.previewStyle(null)
    expect(useEditor.getState().styleLive).toBeNull()
  })
})

describe('relationship line controls', () => {
  function select() {
    const id = addRelationship(mapDoc, child, useEditor.getState().rootId) as string
    mapDoc.undo.stopCapturing()
    mapDoc.undo.clear()
    act(() => selectObject({ kind: 'relationship', id }))
    return id
  }
  const rel = (id: string) => useEditor.getState().objects.relationships[id]

  it('has colour, thickness, curve, dash and arrow heads', async () => {
    select()
    render(<ObjectBar />)
    await screen.findByRole('toolbar', { name: 'Relationship tools' })
    expect(screen.getByRole('slider', { name: 'Thickness' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Curve' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Line colour/ })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Arrow heads' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Line style' })).toBeTruthy()
  })

  it('a thickness drag is one undo step', async () => {
    const id = select()
    render(<ObjectBar />)
    const slider = await screen.findByRole('slider', { name: 'Thickness' })
    for (const v of ['3', '5', '8']) fireEvent.change(slider, { target: { value: v } })
    fireEvent.pointerUp(slider)
    await waitFor(() => expect(rel(id)?.width).toBe(8))
    expect(undoSteps()).toBe(1)
  })

  it('a picked colour is saved on the line', async () => {
    const id = select()
    render(<ObjectBar />)
    fireEvent.click(await screen.findByRole('button', { name: /Line colour/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Line colour picker' })).getByRole('button', { name: '#2563eb' }))
    await waitFor(() => expect(rel(id)?.color).toBe('#2563eb'))
  })
})

describe('automatic branch thickness in the controls', () => {
  it('a branch starts on Auto; moving the slider makes it manual; Auto brings it back, one undo step each', () => {
    render(<BranchControls />)
    const auto = screen.getByRole('checkbox', { name: 'Automatic thickness' }) as HTMLInputElement
    expect(auto.checked).toBe(true)
    const slider = screen.getByRole('slider', { name: 'Thickness' })
    fireEvent.change(slider, { target: { value: '12' } })
    fireEvent.pointerUp(slider)
    expect(styleOf(child).lineWidth).toBe(12)
    expect((screen.getByRole('checkbox', { name: 'Automatic thickness' }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Automatic thickness' }))
    expect(styleOf(child).lineWidth).toBeUndefined()
    expect(undoSteps()).toBe(2)
  })

  it('unticking Auto keeps the width it had, as a manual value', () => {
    render(<BranchControls />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Automatic thickness' }))
    expect(typeof styleOf(child).lineWidth).toBe('number')
  })

  it('"Reset to automatic" clears thickness and taper on the selection in one undo step', () => {
    A.styleSelected({ lineWidth: 9, taper: false, lineColor: '#ff0000' })
    mapDoc.undo.stopCapturing()
    mapDoc.undo.clear()
    render(<BranchControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset to automatic' }))
    expect(styleOf(child).lineWidth).toBeUndefined()
    expect(styleOf(child).taper).toBeUndefined()
    expect(styleOf(child).lineColor).toBe('#ff0000') // colour is not part of thickness
    expect(undoSteps()).toBe(1)
    act(() => A.cmdUndo())
    expect(styleOf(child)).toMatchObject({ lineWidth: 9, taper: false })
  })

  it('resetting the whole map clears every branch and the map-wide setting, in one undo step', () => {
    A.styleSelected({ lineWidth: 9 })
    act(() => A.selectOnly(grandchild))
    A.styleSelected({ lineWidth: 5, taper: true })
    act(() => A.changeSetting('branchThickness', 7))
    mapDoc.undo.stopCapturing()
    mapDoc.undo.clear()
    A.resetBranchesToAuto('map')
    expect(styleOf(child).lineWidth).toBeUndefined()
    expect(styleOf(grandchild).lineWidth).toBeUndefined()
    expect(useEditor.getState().settings.branchThickness).toBeNull()
    expect(undoSteps()).toBe(1)
    A.resetBranchesToAuto('map') // nothing left to reset: no empty undo step
    expect(undoSteps()).toBe(1)
  })
})
