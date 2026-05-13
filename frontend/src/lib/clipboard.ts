export async function copyTextToClipboard(text: string) {
  let asyncClipboardError: unknown = null

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch (err) {
      asyncClipboardError = err
    }
  }

  if (copyTextWithExecCommand(text)) return

  throw asyncClipboardError ?? new Error('Clipboard API is not available')
}

export async function copyBlobToClipboard(blob: Blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image API is not available')
  }

  await navigator.clipboard.write([
    new ClipboardItem({ [blob.type]: blob }),
  ])
}

export type CopyImageResult = 'image' | 'rich-image' | 'url'

export async function copyImageSourceToClipboard(src: string, fallbackUrl?: string): Promise<CopyImageResult> {
  let clipboardError: unknown = null
  const canUseAsyncImageClipboard = !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined' && supportsClipboardPng()
  const shouldSkipRichImageFallback = !window.isSecureContext && src.startsWith('blob:')
  const copyFallbackUrl = async () => {
    const url = toAbsoluteHttpUrl(fallbackUrl || src)
    if (!url) return false
    await copyTextToClipboard(url)
    return true
  }
  const copyFallbackUrlWithExecCommand = () => {
    const url = toAbsoluteHttpUrl(fallbackUrl || src)
    return !!url && copyTextWithExecCommand(url)
  }

  if (!canUseAsyncImageClipboard) {
    if (!shouldSkipRichImageFallback && copyImageElementWithExecCommandNow(src)) return 'rich-image'
    if (copyFallbackUrlWithExecCommand()) return 'url'

    try {
      if (!shouldSkipRichImageFallback && await copyImageElementWithExecCommand(src)) return 'rich-image'
    } catch (err) {
      clipboardError = err
    }

    if (copyFallbackUrlWithExecCommand()) return 'url'
    throw clipboardError ?? new Error('Clipboard image API is not available')
  }

  const pngBlobPromise = fetchImageSourceAsPngBlob(src)
  if (canUseAsyncImageClipboard) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlobPromise } as Record<string, Blob | Promise<Blob>>),
      ])
      return 'image'
    } catch (err) {
      clipboardError = err
    }
  }

  let pngBlob: Blob
  try {
    pngBlob = await pngBlobPromise
  } catch (err) {
    clipboardError = err
    if (await copyFallbackUrl()) return 'url'
    throw clipboardError
  }
  if (shouldSkipRichImageFallback) {
    if (await copyFallbackUrl()) return 'url'
    throw clipboardError ?? new Error('Clipboard image API is not available')
  }
  const objectUrl = URL.createObjectURL(pngBlob)
  try {
    if (await copyImageElementWithExecCommand(objectUrl)) {
      return 'rich-image'
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  if (await copyFallbackUrl()) return 'url'

  throw clipboardError ?? new Error('Clipboard image API is not available')
}

function toAbsoluteHttpUrl(url: string): string | null {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null
  try {
    return new URL(url, window.location.href).toString()
  } catch {
    return null
  }
}

export function getClipboardFailureMessage(fallback: string, err: unknown) {
  if (isEmbeddedPage() && isClipboardPermissionError(err)) {
    return '复制失败：内嵌页面未授予剪贴板权限'
  }

  return fallback
}

function supportsClipboardPng() {
  return typeof ClipboardItem.supports !== 'function' || ClipboardItem.supports('image/png')
}

async function fetchImageSourceAsPngBlob(src: string): Promise<Blob> {
  const response = await fetch(src, {
    credentials: 'same-origin',
    cache: src.startsWith('data:') || src.startsWith('blob:') ? 'default' : 'no-store',
  })
  if (!response.ok) throw new Error(`Fetch image failed: HTTP ${response.status}`)
  const blob = await response.blob()
  return blobToPngBlob(blob)
}

async function blobToPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return new Blob([blob], { type: 'image/png' })

  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await loadImage(objectUrl)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) throw new Error('Invalid image dimensions')

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器不支持 Canvas')
    ctx.drawImage(image, 0, 0)

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob)
        else reject(new Error('PNG conversion failed'))
      }, 'image/png')
    })
    return pngBlob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image load failed'))
    image.src = src
  })
}

async function copyImageElementWithExecCommand(src: string): Promise<boolean> {
  const wrapper = document.createElement('div')
  wrapper.contentEditable = 'true'
  wrapper.style.position = 'fixed'
  wrapper.style.left = '0'
  wrapper.style.top = '0'
  wrapper.style.width = '1px'
  wrapper.style.height = '1px'
  wrapper.style.overflow = 'hidden'
  wrapper.style.opacity = '0'
  wrapper.style.pointerEvents = 'none'

  const image = document.createElement('img')
  image.src = src
  wrapper.appendChild(image)
  document.body.appendChild(wrapper)

  try {
    await new Promise<void>((resolve, reject) => {
      if (image.complete && image.naturalWidth > 0) {
        resolve()
        return
      }
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Image load failed'))
    })

    const selection = window.getSelection()
    if (!selection) return false
    const range = document.createRange()
    range.selectNode(image)
    selection.removeAllRanges()
    selection.addRange(range)
    const copied = document.execCommand('copy')
    selection.removeAllRanges()
    return copied
  } catch {
    return false
  } finally {
    document.body.removeChild(wrapper)
  }
}

function copyImageElementWithExecCommandNow(src: string): boolean {
  const wrapper = document.createElement('div')
  wrapper.contentEditable = 'true'
  wrapper.style.position = 'fixed'
  wrapper.style.left = '0'
  wrapper.style.top = '0'
  wrapper.style.width = '1px'
  wrapper.style.height = '1px'
  wrapper.style.overflow = 'hidden'
  wrapper.style.opacity = '0'
  wrapper.style.pointerEvents = 'none'

  const image = document.createElement('img')
  image.src = src
  wrapper.appendChild(image)
  document.body.appendChild(wrapper)

  try {
    const selection = window.getSelection()
    if (!selection) return false
    const range = document.createRange()
    range.selectNode(image)
    selection.removeAllRanges()
    selection.addRange(range)
    const copied = document.execCommand('copy')
    selection.removeAllRanges()
    return copied
  } catch {
    return false
  } finally {
    document.body.removeChild(wrapper)
  }
}

function copyTextWithExecCommand(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'

  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

function isEmbeddedPage() {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

function isClipboardPermissionError(err: unknown) {
  if (!(err instanceof Error)) return false

  return (
    err.name === 'NotAllowedError' ||
    /permission|permissions policy|not allowed|denied/i.test(err.message)
  )
}
