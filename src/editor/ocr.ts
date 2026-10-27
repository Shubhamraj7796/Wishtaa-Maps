export interface OcrLanguage {
  code: string
  label: string
}

/** Languages offered for reading text out of a picture. */
export const OCR_LANGUAGES: OcrLanguage[] = [
  { code: 'eng', label: 'English' },
  { code: 'hin', label: 'Hindi' },
  { code: 'eng+hin', label: 'English + Hindi' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
]

export const OCR_TIMEOUT_MS = 3 * 60 * 1000

/** Splits recognised text into clean, non-empty lines. */
export function ocrLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
}

/** The OCR engine reads PNG and JPEG reliably, but not always WebP (which is how pictures are stored). */
async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png' || blob.type === 'image/jpeg') return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot prepare the picture for reading.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the picture.'))), 'image/png'))
}

interface TesseractModule {
  createWorker: (
    lang: string,
    oem?: number,
    options?: { logger?: (m: { progress?: number; status?: string }) => void }
  ) => Promise<{ recognize: (img: Blob) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> }>
}

/**
 * Reads the text in a picture. The picture never leaves the device: only the OCR engine and its language data are
 * downloaded (once, then cached by the browser). Gives up with a clear message after a few minutes.
 */
export async function recognizeText(blob: Blob, language: string, onProgress: (fraction: number, status: string) => void): Promise<string> {
  const imported = (await import('tesseract.js')) as unknown as Partial<TesseractModule> & { default?: TesseractModule }
  const createWorker = imported.createWorker ?? imported.default?.createWorker
  if (!createWorker) throw new Error('The text-reading engine could not be loaded.')
  const png = await toPng(blob)

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Reading took too long. Check your internet connection and try again.')), OCR_TIMEOUT_MS)
  })
  let worker: Awaited<ReturnType<TesseractModule['createWorker']>> | undefined
  try {
    const work = (async () => {
      worker = await createWorker(language, 1, {
        logger: (m) => {
          if (typeof m.progress === 'number') onProgress(m.progress, m.status ?? '')
        },
      })
      const { data } = await worker.recognize(png)
      return data.text
    })()
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
    void worker?.terminate().catch(() => {})
  }
}
