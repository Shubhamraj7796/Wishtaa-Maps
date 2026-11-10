import type { PdfSource } from '@/core/pdf/types'
import { cmdRedo, cmdUndo } from '../actions'
import { MarkupToolbar, TOOL_KEYS, type ToolbarExtra } from '../markup/MarkupToolbar'
import { useEditor } from '../store'
import { loadPdfUi } from './uiPrefs'
import { setPageEdit, setPdfTool, setPdfToolSide, setToolStyle, turnPage } from './actions'

export { TOOL_KEYS }

/** The pen bar folds to its small button after this long without any activity. */
export const IDLE_MS = 4000

/** The markup tools over a PDF: the shared floating toolbar, with undo, redo and the page actions of the page being looked at. */
export function FloatingTools({ source }: { source: PdfSource }) {
  const tool = useEditor((s) => s.pdfPanel.tool)
  const styles = useEditor((s) => s.pdfPanel.styles)
  const shape = useEditor((s) => s.pdfPanel.shape)
  const page = useEditor((s) => s.pdfPanel.page)
  const canUndo = useEditor((s) => s.canUndo)
  const canRedo = useEditor((s) => s.canRedo)
  const readOnly = useEditor((s) => s.readOnly)
  const extras: ToolbarExtra[] = [
    { key: 'undo', icon: 'undo', label: 'Undo', disabled: !canUndo, onClick: cmdUndo },
    { key: 'redo', icon: 'redo', label: 'Redo', disabled: !canRedo, onClick: cmdRedo },
    { key: 'left', icon: 'reset', label: `Turn page ${page} left`, onClick: () => turnPage(source.id, page, -90) },
    { key: 'right', icon: 'rotateCw', label: `Turn page ${page} right`, onClick: () => turnPage(source.id, page, 90) },
    { key: 'hide', icon: 'eyeOff', label: `Hide page ${page} (the PDF file is not changed; it is left out when you download)`, onClick: () => setPageEdit(source.id, page, { hidden: true }) },
  ]
  return <MarkupToolbar tool={tool} onTool={setPdfTool} styles={styles} onStyle={setToolStyle} shape={shape} extras={extras} placeKey="pdf" onSide={setPdfToolSide} readOnly={readOnly} idleCollapse={loadPdfUi().autoCollapse ? IDLE_MS : undefined} />
}
