import { useEffect, useState, useMemo, useRef, type ReactNode } from 'react'
import { useStore, getCachedImage, ensureImageCached, reuseConfig, editOutputs, removeTask, retryTask } from '../store'
import type { ActualTaskParams } from '../types'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { useTooltip } from '../hooks/useTooltip'
import { formatImageRatio } from '../lib/size'
import { DetailParamValue } from '../lib/paramDisplay'
import { copyImageSourceToClipboard, copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import { createMaskPreviewDataUrl } from '../lib/canvasImage'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import { CloseIcon, CodeIcon, CopyIcon, EditIcon, LinkIcon, TrashIcon } from './icons'

import ViewportTooltip from './ViewportTooltip'

const PARAM_LABELS: Record<string, string> = {
  size: '尺寸',
  quality: '质量',
  n: '数量',
  background: '背景',
  output_format: '格式',
  created: '创建',
  usage: '用量',
  model: '模型',
}

const USAGE_LABELS: Record<string, string> = {
  total_tokens: '总量',
  input_tokens: '输入',
  output_tokens: '输出',
  prompt_tokens: '提示词',
  completion_tokens: '补全',
  image_tokens: '图片',
  text_tokens: '文本',
  cached_tokens: '缓存',
  reasoning_tokens: '推理',
  requests: '请求',
  input_tokens_details: '输入明细',
  output_tokens_details: '输出明细',
  prompt_tokens_details: '提示词明细',
  completion_tokens_details: '补全明细',
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function formatInfoValue(key: string, value: unknown): string {
  if (value == null) return ''
  if (key === 'created' && typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toLocaleString('zh-CN')
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function getInfoEntries(params?: ActualTaskParams | Record<string, unknown>) {
  if (!params || !isPlainRecord(params)) return []
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({
      key,
      label: PARAM_LABELS[key] ?? key,
      value: formatInfoValue(key, value),
    }))
    .filter((entry) => entry.value.length > 0)
}

function formatUsageLabel(path: string[]) {
  const labels = path.map((part) => USAGE_LABELS[part] ?? part)
  return labels.length > 1 ? labels.join(' / ') : labels[0]
}

function flattenUsageEntries(value: unknown, path: string[] = []): ReturnType<typeof getInfoEntries> {
  if (!isPlainRecord(value)) {
    const formatted = formatInfoValue(path[path.length - 1] || 'usage', value)
    return formatted ? [{ key: path.join('.'), label: formatUsageLabel(path), value: formatted }] : []
  }

  const preferredOrder = [
    'total_tokens',
    'input_tokens',
    'output_tokens',
    'prompt_tokens',
    'completion_tokens',
    'image_tokens',
    'text_tokens',
    'cached_tokens',
    'reasoning_tokens',
    'requests',
    'input_tokens_details',
    'output_tokens_details',
    'prompt_tokens_details',
    'completion_tokens_details',
  ]
  const orderedKeys = [
    ...preferredOrder.filter((key) => Object.prototype.hasOwnProperty.call(value, key)),
    ...Object.keys(value).filter((key) => !preferredOrder.includes(key)),
  ]

  return orderedKeys.flatMap((key) => {
    const nextValue = value[key]
    if (nextValue === undefined || nextValue === null || nextValue === '') return []
    return flattenUsageEntries(nextValue, [...path, key])
  })
}

function getUsageEntries(params?: ActualTaskParams | Record<string, unknown>) {
  if (!params || !isPlainRecord(params)) return []
  return flattenUsageEntries(params.usage, ['usage']).map((entry) => ({
    ...entry,
    label: entry.label.startsWith('usage / ') ? entry.label.slice('usage / '.length) : entry.label,
  }))
}

export default function DetailModal() {
  const tasks = useStore((s) => s.tasks)
  const detailTaskId = useStore((s) => s.detailTaskId)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)
  const setMaskEditorImageId = useStore((s) => s.setMaskEditorImageId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)

  const [imageIndex, setImageIndex] = useState(0)
  const [imageSrcs, setImageSrcs] = useState<Record<string, string>>({})
  const [outputPreviewSrcs, setOutputPreviewSrcs] = useState<Record<string, string>>({})
  const [imageRatios, setImageRatios] = useState<Record<string, string>>({})
  const [imageSizes, setImageSizes] = useState<Record<string, string>>({})
  const [maskPreviewSrc, setMaskPreviewSrc] = useState('')
  const [now, setNow] = useState(Date.now())
  const [showRawUrlsModal, setShowRawUrlsModal] = useState(false)
  const [showRawResponseModal, setShowRawResponseModal] = useState(false)
  const imagePanelRef = useRef<HTMLDivElement>(null)
  const mainImageRef = useRef<HTMLImageElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const rawUrlsModalRef = useRef<HTMLDivElement>(null)
  const rawResponseModalRef = useRef<HTMLDivElement>(null)
  const [imageLabelLeft, setImageLabelLeft] = useState(8)

  const rawUrlsBackdropPointerDownRef = useRef(false)
  const rawResponseBackdropPointerDownRef = useRef(false)

  const copyErrorTooltip = useTooltip()
  const copyRawUrlsTooltip = useTooltip()
  const viewRawResponseTooltip = useTooltip()
  const retryTooltip = useTooltip()

  const clearTextSelection = () => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) selection.removeAllRanges()
  }

  const task = useMemo(
    () => tasks.find((t) => t.id === detailTaskId) ?? null,
    [tasks, detailTaskId],
  )

  useCloseOnEscape(Boolean(task), () => setDetailTaskId(null))
  usePreventBackgroundScroll(Boolean(task), [modalRef, rawUrlsModalRef, rawResponseModalRef])

  // Reset index when task changes
  useEffect(() => {
    setImageIndex(0)
  }, [detailTaskId])

  useEffect(() => {
    if (task?.status !== 'running' && !(task?.status === 'error' && (task.falRecoverable || task.customRecoverable))) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    setNow(Date.now())
    return () => window.clearInterval(id)
  }, [task?.customRecoverable, task?.falRecoverable, task?.status])

  // 加载所有相关图片
  useEffect(() => {
    if (!task) {
      setImageSrcs({})
      setOutputPreviewSrcs({})
      setImageRatios({})
      setImageSizes({})
      return
    }

    let cancelled = false
    const ids = [...new Set([
      ...(task.inputImageIds || []),
      ...(task.maskImageId ? [task.maskImageId] : []),
    ])]
    const initial: Record<string, string> = {}
    for (const id of ids) {
      const cached = getCachedImage(id)
      if (cached) initial[id] = cached
    }
    setImageSrcs(initial)
    for (const id of ids) {
      if (initial[id]) continue
      ensureImageCached(id).then((url) => {
        if (!cancelled && url) setImageSrcs((prev) => ({ ...prev, [id]: url }))
      })
    }

    return () => {
      cancelled = true
    }
  }, [task])

  const currentOutputImageId = task?.outputImages?.[imageIndex] || ''
  const currentOutputPreviewSrc = currentOutputImageId ? outputPreviewSrcs[currentOutputImageId] || '' : ''
  const maskTargetId = task?.maskTargetImageId || null
  const maskTargetSrc = maskTargetId ? imageSrcs[maskTargetId] || '' : ''
  const maskSrc = task?.maskImageId ? imageSrcs[task.maskImageId] || '' : ''
  const allInputImageIds = task?.inputImageIds ?? []

  useEffect(() => {
    if (!currentOutputImageId) {
      setOutputPreviewSrcs({})
      return
    }

    let cancelled = false
    const setOutputImage = (dataUrl: string) => {
      if (!cancelled) setOutputPreviewSrcs({ [currentOutputImageId]: dataUrl })
    }

    const cached = getCachedImage(currentOutputImageId)
    if (cached) {
      setOutputImage(cached)
    } else {
      ensureImageCached(currentOutputImageId)
        .then((dataUrl) => {
          if (dataUrl) setOutputImage(dataUrl)
        })
        .catch(() => {
          if (!cancelled) setOutputPreviewSrcs({})
        })
    }

    return () => {
      cancelled = true
    }
  }, [currentOutputImageId])

  useEffect(() => {
    const updateImageLabelLeft = () => {
      const panel = imagePanelRef.current
      const image = mainImageRef.current
      if (!panel || !image) return

      const panelRect = panel.getBoundingClientRect()
      const imageRect = image.getBoundingClientRect()
      setImageLabelLeft(Math.max(8, imageRect.left - panelRect.left))
    }

    updateImageLabelLeft()
    window.addEventListener('resize', updateImageLabelLeft)
    return () => window.removeEventListener('resize', updateImageLabelLeft)
  }, [currentOutputPreviewSrc])

  useEffect(() => {
    let cancelled = false
    setMaskPreviewSrc('')
    if (!maskTargetSrc || !maskSrc) return

    createMaskPreviewDataUrl(maskTargetSrc, maskSrc)
      .then((url) => {
        if (!cancelled) setMaskPreviewSrc(url)
      })
      .catch(() => {
        if (!cancelled) setMaskPreviewSrc('')
      })

    return () => {
      cancelled = true
    }
  }, [maskTargetSrc, maskSrc])

  if (!task) return null

  const outputLen = task.outputImages?.length || 0
  const currentImageRatio = currentOutputImageId ? imageRatios[currentOutputImageId] : ''
  const currentImageSize = currentOutputImageId ? imageSizes[currentOutputImageId] : ''
  const currentActualParams = currentOutputImageId
    ? task.actualParamsByImage?.[currentOutputImageId] ?? task.actualParams
    : task.actualParams
  const savedCurrentDimensions = currentOutputImageId ? task.outputImageDimensions?.[currentOutputImageId] : undefined
  const actualCurrentSize = savedCurrentDimensions
    ? `${savedCurrentDimensions.width}×${savedCurrentDimensions.height}`
    : currentImageSize
  const detailSizeValue = task.params.size === 'auto' && actualCurrentSize ? actualCurrentSize : undefined
  const operationKind = task.maskImageId || task.operation === 'edit'
    ? 'edit'
    : task.inputImageIds.length > 0 || task.operation === 'reference'
    ? 'reference'
    : 'generate'
  const operationLabel = operationKind === 'edit'
    ? '局部重绘'
    : operationKind === 'reference'
    ? '参考图生图'
    : '文生图'
  const operationRoute = operationKind === 'edit'
    ? '/web/edit'
    : operationKind === 'reference'
    ? '/web/image'
    : '/web/generate'
  const operationToneClass = operationKind === 'edit'
    ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
    : operationKind === 'reference'
    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
    : 'bg-gray-100 text-gray-600 dark:bg-white/[0.04] dark:text-gray-300'
  const currentRevisedPrompt = currentOutputImageId ? task.revisedPromptByImage?.[currentOutputImageId] : undefined
  const currentRawImageUrl = currentOutputImageId
    ? task.serverImageUrls?.[currentOutputImageId] ?? task.rawImageUrls?.[imageIndex]
    : undefined
  const jobId = task.serverJobId || task.id
  const requestParamEntries = getInfoEntries(task.params as unknown as Record<string, unknown>)
  const actualParamEntries = getInfoEntries(currentActualParams).filter((entry) => entry.key !== 'usage')
  const usageEntries = getUsageEntries(currentActualParams)
  const hasActualParams = actualParamEntries.length > 0
  const hasUsage = usageEntries.length > 0
  const rawResponseText = task.rawResponsePayload || JSON.stringify({
    jobId,
    operation: operationKind,
    route: operationRoute,
    prompt: task.prompt,
    requestParams: task.params,
    actualParams: currentActualParams ?? null,
    outputSize: actualCurrentSize || null,
    revisedPrompt: currentRevisedPrompt ?? null,
    imageUrl: currentRawImageUrl ?? null,
  }, null, 2)
  const isFalReconnecting = task.status === 'error' && Boolean(task.falRecoverable)
  const isCustomReconnecting = task.status === 'error' && Boolean(task.customRecoverable)
  const isReconnecting = isFalReconnecting || isCustomReconnecting
  const rawImageUrls = task.rawImageUrls ?? []

  const formatTime = (ts: number | null) => {
    if (!ts) return ''
    return new Date(ts).toLocaleString('zh-CN')
  }

  const formatDuration = () => {
    if (task.status === 'running' || isFalReconnecting || isCustomReconnecting) {
      const seconds = Math.max(0, Math.floor((now - task.createdAt) / 1000))
      const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
      const ss = String(seconds % 60).padStart(2, '0')
      return `${mm}:${ss}`
    }
    if (task.elapsed == null) return null
    const seconds = Math.floor(task.elapsed / 1000)
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
    const ss = String(seconds % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

  const renderInfoRow = (label: string, value: ReactNode) => (
    <div className="flex gap-3 py-2">
      <span className="w-16 shrink-0 text-gray-400 dark:text-gray-500">{label}</span>
      <div className="min-w-0 flex-1 text-gray-700 dark:text-gray-300">{value}</div>
    </div>
  )

  const renderParamChips = (entries: ReturnType<typeof getInfoEntries>) => (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {entries.map((entry) => (
        <span
          key={entry.key}
          className="inline-flex max-w-full items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 dark:bg-white/[0.04]"
          title={`${entry.label}: ${entry.value}`}
        >
          <span className="shrink-0 text-gray-400 dark:text-gray-500">{entry.label}</span>
          <span className="min-w-0 truncate font-medium text-gray-700 dark:text-gray-300">{entry.value}</span>
        </span>
      ))}
    </div>
  )

  const handleReuse = () => {
    reuseConfig(task)
    setDetailTaskId(null)
  }

  const handleEdit = () => {
    editOutputs(task)
    setDetailTaskId(null)
  }

  const handleMaskEditCurrentOutput = () => {
    const imgId = task.outputImages?.[imageIndex]
    if (!imgId) return
    setMaskEditorImageId(imgId)
    setDetailTaskId(null)
  }

  const handleDelete = () => {
    setDetailTaskId(null)
    setConfirmDialog({
      title: '删除记录',
      message: '确定要删除这条记录吗？关联的图片资源也会被清理（如果没有其他任务引用）。',
      action: () => removeTask(task),
    })
  }

  const handleCopyError = async () => {
    const errorText = task.error || '生成失败'
    try {
      await copyTextToClipboard(errorText)
      showToast('完整报错已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制报错失败', err), 'error')
    }
  }

  const handleCopyPrompt = async () => {
    if (!task.prompt) return
    try {
      await copyTextToClipboard(task.prompt)
      showToast('提示词已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制提示词失败', err), 'error')
    }
  }

  const handleCopyInputImage = async () => {
    const imgId = allInputImageIds[0]
    const src = imgId ? imageSrcs[imgId] : ''
    if (!src) return
    try {
      const copied = await copyImageSourceToClipboard(src, src)
      showToast(copied === 'url' ? '浏览器不支持直接复制图片，已复制参考图链接' : '参考图已复制', copied === 'url' ? 'info' : 'success')
    } catch (err) {
      console.error(err)
      showToast(getClipboardFailureMessage('复制参考图失败', err), 'error')
    }
  }

  const handleCopyCurrentOutputImage = async () => {
    if (!currentOutputImageId) return
    try {
      const src = await ensureImageCached(currentOutputImageId)
      if (!src) throw new Error('图片尚未加载')
      const fallbackUrl = task?.serverImageUrls?.[currentOutputImageId] || src
      const copied = await copyImageSourceToClipboard(src, fallbackUrl)
      showToast(copied === 'url' ? '浏览器不支持直接复制图片，已复制图片链接' : '图片已复制', copied === 'url' ? 'info' : 'success')
    } catch (err) {
      console.error(err)
      showToast(getClipboardFailureMessage('复制图片失败', err), 'error')
    }
  }

  const handleRetry = () => {
    retryTask(task)
    setDetailTaskId(null)
  }

  return (
    <div
      data-no-drag-select
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => setDetailTaskId(null)}
    >
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-md animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-white/50 dark:border-white/[0.08] rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row z-10 ring-1 ring-black/5 dark:ring-white/10 animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 items-center justify-end px-4 md:hidden">
          <button
            onClick={() => setDetailTaskId(null)}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/[0.06] transition text-gray-400"
            aria-label="关闭"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* 左侧：图片 */}
        <div ref={imagePanelRef} className="md:w-1/2 w-full h-64 md:h-auto bg-gray-100 dark:bg-black/20 relative flex items-center justify-center flex-shrink-0 min-h-[16rem]">
          {task.status === 'done' && outputLen > 0 && currentOutputPreviewSrc && (
            <>
              <img
                ref={mainImageRef}
                src={currentOutputPreviewSrc}
                data-image-id={currentOutputImageId}
                className="saveable-image max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] object-contain cursor-pointer"
                onLoad={() => {
                  const panel = imagePanelRef.current
                  const image = mainImageRef.current
                  if (!panel || !image) return

                  if (currentOutputImageId && image.naturalWidth > 0 && image.naturalHeight > 0) {
                    setImageRatios((prev) => ({
                      ...prev,
                      [currentOutputImageId]: formatImageRatio(image.naturalWidth, image.naturalHeight),
                    }))
                    setImageSizes((prev) => ({
                      ...prev,
                      [currentOutputImageId]: `${image.naturalWidth}×${image.naturalHeight}`,
                    }))
                  }

                  const panelRect = panel.getBoundingClientRect()
                  const imageRect = image.getBoundingClientRect()
                  setImageLabelLeft(Math.max(8, imageRect.left - panelRect.left))
                }}
                onClick={() =>
                  setLightboxImageId(task.outputImages[imageIndex], task.outputImages)
                }
                alt=""
              />
              <div data-selectable-text className="absolute top-[15px] flex items-center gap-1.5" style={{ left: imageLabelLeft }}>
                {currentImageRatio && currentImageSize ? (
                  <>
                    <span className="bg-black/50 text-white text-xs px-2 py-0.5 rounded backdrop-blur-sm font-mono">
                      {currentImageRatio}
                    </span>
                    <span className="bg-black/50 text-white/90 text-xs px-2 py-0.5 rounded backdrop-blur-sm font-medium">
                      {currentImageSize}
                    </span>
                  </>
                ) : (
                  formatDuration() && (
                    <span className="flex items-center gap-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded backdrop-blur-sm font-mono">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatDuration()}
                    </span>
                  )
                )}
              </div>
              {outputLen > 1 && (
                <>
                  <button
                    onClick={() =>
                      setImageIndex(
                        (imageIndex - 1 + outputLen) % outputLen,
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() =>
                      setImageIndex((imageIndex + 1) % outputLen)
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                    {imageIndex + 1} / {outputLen}
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  void handleCopyCurrentOutputImage()
                }}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
                title="复制当前图片"
              >
                <CopyIcon className="h-3.5 w-3.5" />
                复制
              </button>
            </>
          )}
          {(task.status === 'running' || isReconnecting) && (
            <>
              <div className="absolute left-4 top-4 flex items-center gap-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded backdrop-blur-sm font-mono">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatDuration()}
              </div>
              {task.status === 'running' && (
                <svg className="w-10 h-10 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </>
          )}
          {task.status === 'error' && isReconnecting && (
            <div className="w-full max-w-md px-4 text-center">
              <svg className="w-10 h-10 text-yellow-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <p className="text-sm font-medium text-yellow-500">重连中</p>
            </div>
          )}
          {task.status === 'error' && !isReconnecting && (
            <div className="w-full max-w-md px-4 text-center">
              <svg className="w-10 h-10 text-red-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p
                className="overflow-hidden whitespace-pre-line text-sm leading-6 text-red-500 break-words"
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 4,
                }}
              >
                {task.error || '生成失败'}
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <div className="relative group">
                  <button
                    type="button"
                    {...copyErrorTooltip.handlers}
                    onClick={(e) => {
                      copyErrorTooltip.handlers.onClick()
                      handleCopyError()
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-red-200/80 bg-white/80 px-3 py-1.5 text-red-500 transition hover:bg-red-50 dark:border-red-400/20 dark:bg-white/[0.04] dark:hover:bg-red-500/10"
                    aria-label="复制完整报错"
                  >
                    <CopyIcon className="h-4 w-4" />
                  </button>
                  <ViewportTooltip visible={copyErrorTooltip.visible} className="whitespace-nowrap">
                    复制完整报错
                  </ViewportTooltip>
                </div>
                {rawImageUrls.length > 0 && (
                  <div className="relative group">
                    <button
                      type="button"
                      {...copyRawUrlsTooltip.handlers}
                      onClick={async (e) => {
                        if (rawImageUrls.length === 1) {
                          copyRawUrlsTooltip.handlers.onClick()
                          try {
                            await copyTextToClipboard(rawImageUrls[0])
                            showToast('图片链接已复制', 'success')
                          } catch (err) {
                            showToast(getClipboardFailureMessage('复制链接失败', err), 'error')
                          }
                        } else {
                          dismissAllTooltips()
                          setShowRawUrlsModal(true)
                        }
                      }}
                      className="inline-flex items-center justify-center rounded-full border border-green-200/80 bg-green-50 px-3 py-1.5 text-green-600 transition hover:bg-green-100 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20"
                      aria-label="复制图片链接"
                    >
                      <LinkIcon className="h-4 w-4" />
                    </button>
                    <ViewportTooltip visible={copyRawUrlsTooltip.visible} className="whitespace-nowrap">
                      复制图片链接
                    </ViewportTooltip>
                  </div>
                )}
                <div className="relative group">
                  <button
                    type="button"
                    {...retryTooltip.handlers}
                    onClick={(e) => {
                      retryTooltip.handlers.onClick()
                      handleRetry()
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-blue-200/80 bg-white/80 px-3 py-1.5 text-blue-500 transition hover:bg-blue-50 dark:border-blue-400/20 dark:bg-white/[0.04] dark:hover:bg-blue-500/10"
                    aria-label="重试任务"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <ViewportTooltip visible={retryTooltip.visible} className="whitespace-nowrap">
                    重试任务
                  </ViewportTooltip>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：信息 */}
        <div className="md:w-1/2 w-full p-5 overflow-y-auto overscroll-contain flex flex-col">
          <button
            onClick={() => setDetailTaskId(null)}
            className="absolute top-3 right-3 hidden p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/[0.06] transition text-gray-400 z-10 md:block"
            aria-label="关闭"
          >
            <CloseIcon className="w-5 h-5" />
          </button>

          <div data-selectable-text className="flex-1">
            <div className="flex items-center gap-1.5 mb-2">
              <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                输入内容
              </h3>
              {task.prompt && (
                <button
                  onClick={handleCopyPrompt}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/[0.06] transition"
                  title="复制提示词"
                >
                  <CopyIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap mb-4">
              {task.prompt || '(无提示词)'}
            </p>

            {/* 参考图 */}
            {allInputImageIds.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {maskTargetId ? '输入图' : '参考图'}
                  </h3>
                  <button
                    onClick={handleCopyInputImage}
                    className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/[0.06] transition"
                    title={maskTargetId ? '复制第 1 张输入图' : '复制参考图'}
                  >
                    <CopyIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {allInputImageIds.map((imgId) => {
                    const isMaskTarget = imgId === maskTargetId
                    const displaySrc = (isMaskTarget && maskPreviewSrc) ? maskPreviewSrc : (imageSrcs[imgId] || '')
                    return (
                      <div key={imgId} className="relative group inline-block">
                        <div
                          className={`relative w-16 h-16 rounded-lg overflow-hidden border cursor-pointer hover:opacity-80 transition ${
                            isMaskTarget ? 'border-blue-500 border-2 shadow-sm' : 'border-gray-200 dark:border-white/[0.08]'
                          }`}
                          onClick={() => setLightboxImageId(imgId, allInputImageIds)}
                        >
                          {displaySrc && (
                            <img
                              src={displaySrc}
                              data-image-id={imgId}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          )}
                          {(maskTargetId || allInputImageIds.length > 0) && (
                            <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[8px] leading-none text-white font-bold tracking-wider backdrop-blur-sm z-10 pointer-events-none ${
                              isMaskTarget ? 'bg-blue-500/90' : 'bg-black/55'
                            }`}>
                              {isMaskTarget ? '主图' : '参考'}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 参数 */}
            <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
              参数配置
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
                <span className="text-gray-400 dark:text-gray-500">尺寸</span>
                <br />
                <DetailParamValue
                  task={task}
                  paramKey="size"
                  className="font-medium"
                  actualParams={currentActualParams}
                  actualDisplayValue={detailSizeValue}
                  actualTooltip={detailSizeValue ? '输出图片实际像素尺寸' : undefined}
                />
              </div>
              <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
                <span className="text-gray-400 dark:text-gray-500">质量</span>
                <br />
                <DetailParamValue task={task} paramKey="quality" className="font-medium" actualParams={currentActualParams} />
              </div>
            </div>

            {/* 生成信息 */}
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  生成信息
                </h3>
                <div className="relative">
                  <button
                    type="button"
                    {...viewRawResponseTooltip.handlers}
                    onClick={(e) => {
                      viewRawResponseTooltip.handlers.onClick()
                      dismissAllTooltips()
                      setShowRawResponseModal(true)
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
                  >
                    <CodeIcon className="h-3.5 w-3.5" />
                    JSON
                  </button>
                  <ViewportTooltip visible={viewRawResponseTooltip.visible} className="whitespace-nowrap">
                    查看完整生成信息
                  </ViewportTooltip>
                </div>
              </div>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 px-3 text-xs dark:divide-white/[0.06] dark:border-white/[0.06]">
                {renderInfoRow('模式', (
                  <span className={`inline-flex rounded-md px-1.5 py-0.5 font-medium ${operationToneClass}`}>
                    {operationLabel}
                  </span>
                ))}
                {renderInfoRow('接口', (
                  <span className="font-mono text-gray-600 dark:text-gray-300">{operationRoute}</span>
                ))}
                {renderInfoRow('Job', (
                  <span className="font-mono text-[11px] text-gray-600 dark:text-gray-300">{jobId}</span>
                ))}
                {actualCurrentSize && renderInfoRow('输出尺寸', (
                  <span className="font-mono text-gray-600 dark:text-gray-300">{actualCurrentSize}</span>
                ))}
                {renderInfoRow('请求参数', renderParamChips(requestParamEntries))}
                {(hasActualParams || !hasUsage) && renderInfoRow('API响应', hasActualParams ? (
                  renderParamChips(actualParamEntries)
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">旧记录未保存 API 实际响应参数</span>
                ))}
                {hasUsage && renderInfoRow('用量', renderParamChips(usageEntries))}
                {currentRevisedPrompt && renderInfoRow('改写提示', (
                  <span className="line-clamp-3 whitespace-pre-wrap leading-5 text-gray-600 dark:text-gray-300">
                    {currentRevisedPrompt}
                  </span>
                ))}
              </div>
            </div>

            {/* 时间 */}
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              <span>创建于 {formatTime(task.createdAt)}</span>
              {formatDuration() && <span> · 耗时 {formatDuration()}</span>}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="grid grid-cols-4 sm:flex gap-2 pt-4 border-t border-gray-100 dark:border-white/[0.08]">
            <button
              onClick={handleReuse}
              className="col-span-2 sm:flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition text-sm font-medium whitespace-nowrap"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              复用配置
            </button>
            <button
              onClick={handleMaskEditCurrentOutput}
              disabled={!outputLen}
              className="col-span-2 sm:flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm font-medium whitespace-nowrap"
            >
              <EditIcon className="w-4 h-4 flex-shrink-0" />
              局部重绘
            </button>
            <button
              onClick={handleEdit}
              disabled={!outputLen}
              className="col-span-2 sm:flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm font-medium whitespace-nowrap"
            >
              <EditIcon className="w-4 h-4 flex-shrink-0" />
              编辑输出
            </button>
            <button
              onClick={handleDelete}
              className="col-span-4 sm:flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition text-sm font-medium whitespace-nowrap"
            >
              <TrashIcon className="w-4 h-4 flex-shrink-0" />
              删除记录
            </button>
          </div>
        </div>
      </div>

      {showRawUrlsModal && rawImageUrls.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm sm:p-6"
          onPointerDown={(e) => {
            rawUrlsBackdropPointerDownRef.current = e.target === e.currentTarget
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (rawUrlsBackdropPointerDownRef.current && e.target === e.currentTarget) setShowRawUrlsModal(false)
            rawUrlsBackdropPointerDownRef.current = false
          }}
        >
          <div ref={rawUrlsModalRef} className="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[#1c1c1e]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08] shrink-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">原始图片链接 ({rawImageUrls.length})</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await copyTextToClipboard(rawImageUrls.join('\n'))
                      showToast('复制成功', 'success')
                    } catch (err) {
                      showToast(getClipboardFailureMessage('复制失败', err), 'error')
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors text-xs font-medium"
                >
                  <CopyIcon className="w-3.5 h-3.5" />
                  全部复制
                </button>
                <button
                  type="button"
                  onClick={() => setShowRawUrlsModal(false)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-white/[0.08] dark:hover:text-gray-300 transition-colors"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 bg-gray-50/50 dark:bg-black/20 overscroll-contain">
              <div className="space-y-2.5">
                {rawImageUrls.map((url, i) => (
                  <div key={i} className="group flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-white dark:bg-[#1c1c1e] border border-gray-100 dark:border-white/[0.06] shadow-sm hover:shadow-md transition-all">
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="text-xs font-medium text-gray-400 dark:text-gray-500">
                        图片 {i + 1}
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 truncate select-text" title={url}>
                        {url}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await copyTextToClipboard(url)
                          showToast('复制成功', 'success')
                        } catch (err) {
                          showToast(getClipboardFailureMessage('复制失败', err), 'error')
                        }
                      }}
                      className="flex-shrink-0 p-2 sm:px-3 sm:py-1.5 flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors text-xs font-medium border border-transparent dark:border-white/[0.04]"
                      title="复制链接"
                    >
                      <CopyIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      <span className="hidden sm:inline">复制</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showRawResponseModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm sm:p-6"
          onPointerDown={(e) => {
            rawResponseBackdropPointerDownRef.current = e.target === e.currentTarget
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (rawResponseBackdropPointerDownRef.current && e.target === e.currentTarget) setShowRawResponseModal(false)
            rawResponseBackdropPointerDownRef.current = false
          }}
        >
          <div ref={rawResponseModalRef} className="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[#1c1c1e]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08] shrink-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">完整生成信息</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await copyTextToClipboard(rawResponseText)
                      showToast('复制成功', 'success')
                    } catch (err) {
                      showToast(getClipboardFailureMessage('复制失败', err), 'error')
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors text-xs font-medium"
                >
                  <CopyIcon className="w-3.5 h-3.5" />
                  复制
                </button>
                <button
                  type="button"
                  onClick={() => setShowRawResponseModal(false)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-white/[0.08] dark:hover:text-gray-300 transition-colors"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto bg-gray-950 p-4 overscroll-contain">
              <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-gray-100 select-text">
                {rawResponseText}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
