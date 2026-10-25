import { useEffect, useRef } from 'react'
import type { Scene } from '@/core/layout/mindmap'
import { setViewport } from '../actions'
import { useEditor } from '../store'
import { branchColor } from './TopicView'

const W = 190
const H = 120

export function Minimap({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const viewport = useEditor((s) => s.viewport)
  const size = useEditor((s) => s.canvasSize)
  const selected = useEditor((s) => s.selected)

  const b = scene.bounds
  const pad = 200
  const x0 = b.x - pad
  const y0 = b.y - pad
  const ww = Math.max(b.w + pad * 2, 1)
  const hh = Math.max(b.h + pad * 2, 1)
  const scale = Math.min(W / ww, H / hh)
  const offX = (W - ww * scale) / 2
  const offY = (H - hh * scale) / 2

  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = window.devicePixelRatio || 1
    c.width = W * dpr
    c.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const sel = new Set(selected)
    scene.boxes.forEach((bx) => {
      ctx.fillStyle = sel.has(bx.id) ? '#f59e0b' : branchColor(bx.branch)
      ctx.globalAlpha = bx.depth > 2 ? 0.45 : 0.85
      ctx.fillRect(offX + (bx.x - x0) * scale, offY + (bx.y - y0) * scale, Math.max(2, bx.w * scale), Math.max(1.5, bx.h * scale))
    })
    ctx.globalAlpha = 1
    // Current viewport.
    const vx = (-viewport.x / viewport.k - x0) * scale + offX
    const vy = (-viewport.y / viewport.k - y0) * scale + offY
    ctx.strokeStyle = '#0d9488'
    ctx.lineWidth = 1.5
    ctx.strokeRect(vx, vy, (size.w / viewport.k) * scale, (size.h / viewport.k) * scale)
  }, [scene, viewport, size, selected, scale, offX, offY, x0, y0])

  const moveTo = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    const wx = (e.clientX - r.left - offX) / scale + x0
    const wy = (e.clientY - r.top - offY) / scale + y0
    setViewport({ k: viewport.k, x: size.w / 2 - wx * viewport.k, y: size.h / 2 - wy * viewport.k })
  }

  return (
    <div
      className="absolute bottom-3 right-3 hidden overflow-hidden rounded-ui border border-line bg-surface/90 shadow-sm sm:block"
      onPointerDown={(e) => e.stopPropagation()}
      aria-hidden="true"
    >
      <canvas
        ref={ref}
        style={{ width: W, height: H, cursor: 'pointer', display: 'block' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          moveTo(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) moveTo(e)
        }}
      />
    </div>
  )
}
