// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichNoteEditor, type NoteEditorHandle } from './RichNoteEditor'

// jsdom cannot measure text; the editor scrolls the cursor into view with these.
const none = { length: 0, item: () => null, [Symbol.iterator]: function* () {} }
Range.prototype.getClientRects = () => none as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()
Element.prototype.getClientRects = () => none as unknown as DOMRectList

afterEach(cleanup)
const settle = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

const LIST =
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Order stock</p></li><li data-type="taskItem" data-checked="true"><p>Call supplier</p></li></ul>'

async function mount(html: string, opts: { readOnly?: boolean } = {}) {
  const handle = { current: null } as { current: NoteEditorHandle | null }
  const onSave = vi.fn()
  render(<RichNoteEditor html={html} onSave={onSave} label="Note text" readOnly={opts.readOnly} handle={handle} />)
  await settle()
  const editor = () => {
    const e = handle.current?.editor
    if (!e) throw new Error('no editor')
    return e
  }
  const key = (k: string, mods: Partial<KeyboardEventInit> = {}) => act(() => void fireEvent.keyDown(editor().view.dom, { key: k, ...mods }))
  const items = () => [...editor().view.dom.querySelectorAll('ul[data-type="taskList"] > li')]
  return { handle, onSave, editor, key, items }
}
/** Puts the cursor at the end of the text of the n-th paragraph (0 based) in the document. */
function cursorInParagraph(editor: () => ReturnType<typeof Object>, n: number) {
  const e = editor() as unknown as { state: { doc: { descendants: (f: (node: { type: { name: string }; nodeSize: number }, pos: number) => boolean | void) => void } }; commands: { setTextSelection: (p: number) => boolean } }
  let i = 0
  let found = -1
  e.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      if (i === n) found = pos + node.nodeSize - 1
      i += 1
    }
    return true
  })
  act(() => void e.commands.setTextSelection(found))
}

describe('the Checklist tool', () => {
  it('is in the toolbar, turns the selected lines into a checklist and back, and knows the cursor is in one', async () => {
    const { editor } = await mount('<p>one</p><p>two</p>')
    const btn = screen.getByRole('button', { name: 'Checklist' })
    expect(btn.hasAttribute('title')).toBe(false)
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    act(() => void editor().commands.selectAll())
    fireEvent.mouseDown(btn)
    fireEvent.click(btn)
    await settle()
    expect(editor().view.dom.querySelectorAll('ul[data-type="taskList"] > li')).toHaveLength(2)
    cursorInParagraph(editor, 0)
    expect(editor().isActive('taskList')).toBe(true) // the tool shows this as highlighted (checked in the real browser test)
    // Back again with Select all (Ctrl+A): the same tool turns the same lines back into paragraphs.
    act(() => void editor().commands.selectAll())
    fireEvent.click(screen.getByRole('button', { name: 'Checklist' }))
    await settle()
    expect(editor().view.dom.querySelectorAll('ul[data-type="taskList"] > li')).toHaveLength(0)
    expect([...editor().view.dom.querySelectorAll('p')].map((p) => p.textContent).filter(Boolean)).toEqual(['one', 'two'])
  })

  it('a bulleted list becomes a checklist and back', async () => {
    const { editor } = await mount('<ul><li><p>a</p></li><li><p>b</p></li></ul>')
    cursorInParagraph(editor, 0)
    act(() => void editor().chain().focus().toggleTaskList().run())
    expect(editor().view.dom.querySelector('ul[data-type="taskList"]')?.textContent).toContain('a')
    act(() => void editor().chain().focus().toggleBulletList().run())
    expect(editor().view.dom.querySelectorAll('ul[data-type="taskList"]')).toHaveLength(0)
    expect(editor().getText()).toContain('a')
  })
})

describe('writing a checklist', () => {
  it('the saved text of ticked and unticked items keeps the state, and each box has a name that says it', async () => {
    const { handle, onSave, editor } = await mount(LIST)
    const boxes = [...editor().view.dom.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([false, true])
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['Order stock, not done', 'Call supplier, done'])
    // A change is saved with the state in it.
    fireEvent.click(boxes[0]!)
    act(() => handle.current?.flush())
    expect(onSave).toHaveBeenCalled()
    const html = onSave.mock.calls.at(-1)?.[0] as string
    expect(html).toContain('data-checked="true"')
    expect((html.match(/data-checked="true"/g) ?? []).length).toBe(2)
  })

  it('Enter makes the next item, Enter on an empty item leaves the list', async () => {
    const { editor, key, items } = await mount('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>first</p></li></ul>')
    cursorInParagraph(editor, 0)
    await key('Enter')
    expect(items()).toHaveLength(2)
    await key('Enter') // the new item is empty
    expect(items()).toHaveLength(1)
    expect(editor().view.dom.querySelectorAll(':scope > p').length).toBeGreaterThanOrEqual(1) // a paragraph after the list
  })

  it('Tab nests an item, Shift+Tab un-nests it', async () => {
    const { editor, key, items } = await mount('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>a</p></li><li data-type="taskItem" data-checked="false"><p>b</p></li></ul>')
    cursorInParagraph(editor, 1)
    await key('Tab')
    expect(editor().view.dom.querySelectorAll('ul[data-type="taskList"] ul[data-type="taskList"]')).toHaveLength(1)
    expect(items()).toHaveLength(2)
    await key('Tab', { shiftKey: true })
    expect(editor().view.dom.querySelectorAll('ul[data-type="taskList"] ul[data-type="taskList"]')).toHaveLength(0)
  })

  it('Backspace on an empty item turns it back into a paragraph', async () => {
    const { editor, key, items } = await mount('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>a</p></li><li data-type="taskItem" data-checked="false"><p></p></li></ul>')
    cursorInParagraph(editor, 1)
    await key('Backspace')
    expect(items().length).toBeLessThan(2)
  })

  it('Ctrl+Enter ticks and unticks only the item the cursor is in (not the item it is nested under)', async () => {
    const { editor, key, items } = await mount(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>parent</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>child</p></li></ul></li></ul>'
    )
    cursorInParagraph(editor, 1)
    await key('Enter', { ctrlKey: true })
    expect(items().map((i) => i.getAttribute('data-checked'))).toEqual(['false', 'true'])
    expect((items()[1]?.querySelector('div > p') as HTMLElement).textContent).toBe('child')
    await key('Enter', { ctrlKey: true })
    expect(items().map((i) => i.getAttribute('data-checked'))).toEqual(['false', 'false'])
  })

  it('outside a checklist Ctrl+Enter keeps the editor own meaning (a line break), not a tick', async () => {
    const { editor, key } = await mount('<p>plain</p>')
    cursorInParagraph(editor, 0)
    await key('Enter', { ctrlKey: true })
    expect(editor().view.dom.querySelectorAll('ul[data-type="taskList"] > li')).toHaveLength(0)
  })

  it('pasting a checklist inside the editor keeps the boxes and their state', async () => {
    const { editor, items } = await mount('<p></p>')
    act(() => void editor().commands.insertContent(LIST)) // the same parsing a paste of HTML goes through
    expect(items().map((i) => i.getAttribute('data-checked'))).toEqual(['false', 'true'])
    expect(editor().getText()).toContain('Order stock')
  })
})

describe('Read mode', () => {
  it('shows the boxes but a click on one changes nothing and nothing is saved', async () => {
    const { handle, onSave, editor, items } = await mount(LIST, { readOnly: true })
    expect(screen.queryByRole('button', { name: 'Checklist' })).toBeNull() // no toolbar in Read mode
    const box = editor().view.dom.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    await settle(700)
    act(() => handle.current?.flush())
    expect(box.checked).toBe(false)
    expect(items().map((i) => i.getAttribute('data-checked'))).toEqual(['false', 'true'])
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('the toolbar with the new tool', () => {
  it('the Checklist icon is its own icon, not the one of "Add task details"', async () => {
    const { ICONS } = await import('@/ui/icons')
    expect(ICONS.checklist).toBeTruthy()
    expect(ICONS.checklist).not.toBe(ICONS.task)
    expect(ICONS.checklist).not.toBe(ICONS.taskList)
  })
})
