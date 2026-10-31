import type { ComponentType, SVGProps } from 'react'
import {
  AlignLeft, AlertTriangle, ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp,
  ArrowUpDown, ArrowUpLeft, ArrowUpRight, BarChart3, Bell, Bold, Book, Bookmark, Braces, Brush, Calendar, Camera, Check,
  CheckSquare, ChevronDown, ChevronRight, CircleHelp, Clock, Code, Command, CornerDownRight, Copy, DollarSign, Download,
  Eraser, Eye, Flag, Flame, Focus, Gift, Globe, Hand, Heart, Hash, Heading1, Heading2, Home, Image as ImageIcon, ImagePlus,
  Info, Italic, Key, Layers, LayoutGrid, Lightbulb, Link2, List, ListChecks, ListOrdered, Lock, Locate, Mail, Maximize,
  MessageSquare, Minimize, Minus, Moon, MousePointer2, Music, Network, Notebook, Paintbrush, Palette, PanelRight, Paperclip,
  Pencil, Phone, Pin, Plus, Quote, Redo2, RefreshCw, Rocket, RotateCcw, ScanText, Search, Settings, Shapes, Shield,
  Sigma, Smile, SquareDashed, Star, StickyNote, Strikethrough, Sun, Table, Tag, Target, ThumbsDown, ThumbsUp, Trash2, Trophy,
  Type, Underline, Undo2, Unlink, Unlock, User, Users, X, XCircle, Zap, ZoomIn, ZoomOut, SlidersHorizontal, Share2, Info as InfoIcon,
} from 'lucide-react'
import type { Shape } from '@/core/model/types'
import { shapeGeometry } from '@/core/shapes'
import type { LineStyle } from '@/core/model/types'
import type { ArrowEnds } from '@/core/model/objects'

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>

/** One place for every icon the UI uses, so tools always look the same wherever they appear. */
export const ICONS = {
  undo: Undo2, redo: Redo2, plus: Plus, minus: Minus, close: X, check: Check, copy: Copy, trash: Trash2, edit: Pencil,
  topic: Plus, subTopic: CornerDownRight, floating: Shapes, hand: Hand, select: MousePointer2, format: SlidersHorizontal,
  painter: Paintbrush, search: Search, focus: Focus, command: Command, help: CircleHelp, moon: Moon, sun: Sun,
  relationship: Share2, callout: MessageSquare, boundary: SquareDashed, summary: Braces, insert: Plus,
  notes: StickyNote, inlineNote: AlignLeft, tag: Tag, task: ListChecks, taskDone: CheckSquare, link: Link2, unlink: Unlink,
  attachment: Paperclip, latex: Sigma, table: Table, numbering: ListOrdered, image: ImageIcon, imageAdd: ImagePlus,
  mark: Smile, clipart: Shapes, details: Layers, layout: LayoutGrid, theme: Palette, style: Brush, outline: List, map: Network,
  chevronRight: ChevronRight, chevronDown: ChevronDown, zoomIn: ZoomIn, zoomOut: ZoomOut, fit: Locate, fullscreen: Maximize,
  exitFullscreen: Minimize, bold: Bold, italic: Italic, underline: Underline, strike: Strikethrough, h1: Heading1, h2: Heading2,
  bulletList: List, orderedList: ListOrdered, quote: Quote, code: Code, ocr: ScanText, download: Download, preview: Eye,
  replace: RefreshCw, reset: RotateCcw, eraser: Eraser, panel: PanelRight, notebook: Notebook, type: Type, pin: Pin,
  info: InfoIcon, warning: AlertTriangle, cancel: XCircle, hash: Hash,
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 18, className, strokeWidth = 1.9 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  const C = ICONS[name] as IconComponent
  return <C size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" focusable="false" />
}

/** Icons for the "symbol" marks. */
export const SYMBOL_ICONS: Record<string, IconComponent> = {
  check: Check, cross: X, alert: AlertTriangle, help: CircleHelp, info: Info, heart: Heart, thumbsUp: ThumbsUp,
  thumbsDown: ThumbsDown, bookmark: Bookmark, bell: Bell, calendar: Calendar, clock: Clock, phone: Phone, mail: Mail,
  lock: Lock, unlock: Unlock, lightbulb: Lightbulb, trophy: Trophy, target: Target, zap: Zap, flame: Flame, gift: Gift,
  key: Key, pin: Pin, users: Users, user: User, home: Home, globe: Globe, search: Search, settings: Settings,
  dollar: DollarSign, chart: BarChart3, book: Book, camera: Camera, music: Music, link: Link2, flag: Flag, star: Star,
  rocket: Rocket, shield: Shield,
}

export const ARROW_ICONS: Record<string, IconComponent> = {
  up: ArrowUp, down: ArrowDown, left: ArrowLeft, right: ArrowRight, upleft: ArrowUpLeft, upright: ArrowUpRight,
  downleft: ArrowDownLeft, downright: ArrowDownRight, leftright: ArrowLeftRight, updown: ArrowUpDown,
}

// ---------------------------------------------------------------------------------------------
// Small drawings
// ---------------------------------------------------------------------------------------------

type Prim =
  | { t: 'r'; x: number; y: number; w?: number; h?: number; f?: boolean }
  | { t: 'p'; d: string }
  | { t: 'e'; cx: number; cy: number; rx: number; ry: number; f?: boolean }
  | { t: 'c'; cx: number; cy: number; r: number; dash?: boolean }

const r = (x: number, y: number, f = false, w = 10, h = 6): Prim => ({ t: 'r', x, y, w, h, f })
const p = (d: string): Prim => ({ t: 'p', d })
const L = (x1: number, y1: number, x2: number, y2: number): Prim => p(`M${x1} ${y1}L${x2} ${y2}`)

/** Schematic of each layout (56 x 36), so a layout can be recognised by sight. */
const THUMBS: Record<string, Prim[]> = {
  'mindmap:both': [r(23, 15, true), r(4, 5), r(4, 25), r(42, 5), r(42, 25), L(23, 18, 14, 8), L(23, 18, 14, 28), L(33, 18, 42, 8), L(33, 18, 42, 28)],
  'mindmap:right': [r(4, 15, true), r(30, 4), r(30, 15), r(30, 26), L(14, 18, 30, 7), L(14, 18, 30, 18), L(14, 18, 30, 29)],
  'mindmap:left': [r(42, 15, true), r(16, 4), r(16, 15), r(16, 26), L(42, 18, 26, 7), L(42, 18, 26, 18), L(42, 18, 26, 29)],
  'mindmap:down': [r(23, 3, true), r(5, 26), r(23, 26), r(41, 26), L(28, 9, 10, 26), L(28, 9, 28, 26), L(28, 9, 46, 26)],
  'mindmap:up': [r(23, 27, true), r(5, 4), r(23, 4), r(41, 4), L(28, 27, 10, 10), L(28, 27, 28, 10), L(28, 27, 46, 10)],
  'tree:right': [r(3, 15, true), r(30, 4), r(30, 15), r(30, 26), p('M13 18H21V7H30M21 18H30M21 18V29H30')],
  'tree:left': [r(43, 15, true), r(16, 4), r(16, 15), r(16, 26), p('M43 18H35V7H26M35 18H26M35 18V29H26')],
  'tree:down': [r(23, 3, true), r(5, 26), r(23, 26), r(41, 26), p('M28 9V17.5M10 26V17.5H46V26M28 17.5V26')],
  'tree:up': [r(23, 27, true), r(5, 4), r(23, 4), r(41, 4), p('M28 27V18.5M10 10V18.5H46V10M28 18.5V10')],
  'timeline:horizontal': [p('M3 18H53'), r(8, 5), r(22, 25), r(36, 5), p('M13 11V18M27 25V18M41 11V18')],
  'timeline:vertical': [p('M28 2V34'), r(34, 5), r(12, 15), r(34, 25), p('M34 8H28M22 18H28M34 28H28')],
  'org:down': [r(23, 2, true), r(5, 15), r(23, 15), r(41, 15), r(5, 28), r(41, 28), p('M28 8V11.5M10 15V11.5H46V15M28 11.5V15M10 21V28M46 21V28')],
  'org:right': [r(3, 15, true), r(22, 5), r(22, 25), r(40, 2), r(40, 10), r(40, 22), p('M13 18H17V8H22M17 18V28H22M32 8H36V5H40M36 8V13H40M32 28H36V25H40')],
  'org:compact': [r(23, 2, true), r(5, 14), r(41, 14), r(10, 23, false, 9, 5), r(10, 30, false, 9, 5), r(46, 23, false, 9, 5), r(46, 30, false, 9, 5), p('M28 8V11M10 14V11H46V14M8 20V32M8 25.5H10M8 32.5H10M44 20V32M44 25.5H46M44 32.5H46')],
  'fishbone:left': [r(2, 15, true), p('M12 18H54'), L(20, 5, 26, 18), L(20, 31, 26, 18), L(36, 5, 42, 18), L(36, 31, 42, 18), r(14, 2, false, 9, 5), r(14, 29, false, 9, 5), r(30, 2, false, 9, 5), r(30, 29, false, 9, 5)],
  'fishbone:right': [r(44, 15, true), p('M2 18H44'), L(10, 5, 16, 18), L(10, 31, 16, 18), L(26, 5, 32, 18), L(26, 31, 32, 18), r(3, 2, false, 9, 5), r(3, 29, false, 9, 5), r(19, 2, false, 9, 5), r(19, 29, false, 9, 5)],
  'table:rows': [r(3, 4, true, 14, 28), r(19, 4, false, 16, 13), r(19, 19, false, 16, 13), r(37, 4, false, 16, 6), r(37, 11, false, 16, 6), r(37, 19, false, 16, 6), r(37, 26, false, 16, 6)],
  'table:columns': [r(3, 3, true, 50, 6), r(3, 11, false, 24, 6), r(29, 11, false, 24, 6), r(3, 19, false, 11, 6), r(16, 19, false, 11, 6), r(29, 19, false, 11, 6), r(42, 19, false, 11, 6)],
  circular: [r(23, 15, true), { t: 'c', cx: 28, cy: 18, r: 14, dash: true }, r(23, 1), r(41, 15), r(23, 29), r(5, 15), L(28, 15, 28, 7), L(33, 18, 41, 18), L(28, 21, 28, 29), L(23, 18, 15, 18)],
  bubble: [{ t: 'e', cx: 28, cy: 18, rx: 8, ry: 5, f: true }, { t: 'e', cx: 10, cy: 8, rx: 7, ry: 4.5 }, { t: 'e', cx: 46, cy: 8, rx: 7, ry: 4.5 }, { t: 'e', cx: 10, cy: 29, rx: 7, ry: 4.5 }, { t: 'e', cx: 46, cy: 29, rx: 7, ry: 4.5 }, L(21, 15, 16, 11), L(35, 15, 40, 11), L(21, 21, 16, 26), L(35, 21, 40, 26)],
  sector: [{ t: 'c', cx: 28, cy: 18, r: 16 }, r(24, 15, true, 8, 6), L(28, 18, 28, 2), L(28, 18, 42, 26), L(28, 18, 14, 26)],
  'bracket:right': [r(3, 15, true), p('M22 5Q18 5 18 9V15Q18 18 14 18M14 18Q18 18 18 21V27Q18 31 22 31'), r(28, 3), r(28, 15), r(28, 27), L(22, 6, 28, 6), L(22, 18, 28, 18), L(22, 30, 28, 30)],
  'bracket:left': [r(43, 15, true), p('M34 5Q38 5 38 9V15Q38 18 42 18M42 18Q38 18 38 21V27Q38 31 34 31'), r(18, 3), r(18, 15), r(18, 27), L(34, 6, 28, 6), L(34, 18, 28, 18), L(34, 30, 28, 30)],
}

export function LayoutThumb({ id, size = 56 }: { id: string; size?: number }) {
  const prims = THUMBS[id] ?? THUMBS['mindmap:both']!
  return (
    <svg width={size} height={(size * 36) / 56} viewBox="0 0 56 36" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {prims.map((q, i) => {
        if (q.t === 'r') return <rect key={i} x={q.x} y={q.y} width={q.w} height={q.h} rx="1.6" fill={q.f ? 'currentColor' : 'none'} />
        if (q.t === 'e') return <ellipse key={i} cx={q.cx} cy={q.cy} rx={q.rx} ry={q.ry} fill={q.f ? 'currentColor' : 'none'} />
        if (q.t === 'c') return <circle key={i} cx={q.cx} cy={q.cy} r={q.r} strokeDasharray={q.dash ? '2 2.5' : undefined} />
        return <path key={i} d={q.d} />
      })}
    </svg>
  )
}

export const hasLayoutThumb = (id: string) => id in THUMBS
export const thumbIds = () => Object.keys(THUMBS)

export function ShapeIcon({ shape, size = 22 }: { shape: Shape; size?: number }) {
  const g = shapeGeometry(shape, 30, 21, { bw: 1.6 })
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 30 21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {shape === 'textOnly' && <path d="M5 8h20M9 13h12" strokeDasharray="1.5 2.5" />}
      {g.layers.map((l, i) => {
        if (l.kind === 'fillOnly') return null
        if (l.kind === 'ring') return <path key={i} d={l.d} fill="currentColor" stroke="none" fillRule="evenodd" />
        if (l.kind === 'inner') return <path key={i} d={l.d} fill="currentColor" stroke="none" />
        return <path key={i} d={l.d} strokeDasharray={l.dash === '8 5' ? '3 2' : l.dash ? '0.5 2.6' : undefined} />
      })}
    </svg>
  )
}

export function LineIcon({ style, size = 30 }: { style: LineStyle; size?: number }) {
  const dash = style === 'dashed' ? '6 4' : style === 'dotted' ? '1.5 4.5' : undefined
  return (
    <svg width={size} height="10" viewBox="0 0 30 10" aria-hidden="true">
      <path d="M2 5H28" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  )
}

export function ArrowEndsIcon({ ends, size = 30 }: { ends: ArrowEnds; size?: number }) {
  const start = ends === 'start' || ends === 'both'
  const end = ends === 'end' || ends === 'both'
  return (
    <svg width={size} height="12" viewBox="0 0 30 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={`M${start ? 6 : 3} 6H${end ? 24 : 27}`} />
      {start && <path d="M9 2.5L5 6L9 9.5" />}
      {end && <path d="M21 2.5L25 6L21 9.5" />}
    </svg>
  )
}

/** Where a picture sits in a topic: a small box with a picture block placed above/below/left/right/behind the text. */
export function PositionIcon({ position, size = 24 }: { position: 'above' | 'below' | 'left' | 'right' | 'behind'; size?: number }) {
  const pic: Record<string, [number, number, number, number]> = {
    above: [4, 3, 16, 7], below: [4, 14, 16, 7], left: [3, 4, 8, 14], right: [13, 4, 8, 14], behind: [4, 3, 16, 16],
  }
  const txt: Record<string, string> = {
    above: 'M6 17H18', below: 'M6 7H18', left: 'M14 9H20M14 13H20', right: 'M4 9H10M4 13H10', behind: 'M7 11H17',
  }
  const [x, y, w, h] = pic[position] as [number, number, number, number]
  return (
    <svg width={size} height={size} viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="19" rx="3" opacity=".5" />
      <rect x={x} y={y} width={w} height={h} rx="1.5" fill="currentColor" fillOpacity={position === 'behind' ? 0.25 : 0.55} stroke="none" />
      <path d={txt[position]} strokeWidth="1.8" />
    </svg>
  )
}
