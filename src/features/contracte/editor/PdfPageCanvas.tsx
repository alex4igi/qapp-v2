import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

type Props = {
  doc: PDFDocumentProxy
  pageNumber: number
  scale: number
  onRendered?: (size: { width: number; height: number }) => void
  // Overlay-ul de câmpuri (FieldBox-uri), poziționat exact peste dimensiunile
  // randate — copiii folosesc procente (left/top/width/height), nu px absoluți.
  children?: ReactNode
  onCanvasClick?: () => void
}

export function PdfPageCanvas({ doc, pageNumber, scale, onRendered, children, onCanvasClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    let renderTask: RenderTask | null = null
    const canvas = canvasRef.current
    if (!canvas) return

    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const context = canvas.getContext('2d')
      if (!context) return
      renderTask = page.render({ canvasContext: context, viewport, canvas })
      renderTask.promise
        .then(() => {
          if (cancelled) return
          const s = { width: viewport.width, height: viewport.height }
          setSize(s)
          onRendered?.(s)
        })
        .catch((e) => {
          // Anulările din cleanup (unmount/re-render StrictMode) sunt așteptate.
          if (e?.name !== 'RenderingCancelledException') console.error(e)
        })
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber, scale])

  return (
    <div className="relative inline-block" style={size ?? undefined}>
      <canvas ref={canvasRef} className="block" onMouseDown={onCanvasClick} />
      {size && (
        <div className="absolute inset-0" style={{ width: size.width, height: size.height }}>
          {children}
        </div>
      )}
    </div>
  )
}
