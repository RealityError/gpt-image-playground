import type { TaskRecord } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { deleteTask as dbDeleteTask, putTask } from './db'

// Removed fields no longer in TaskParams — keep compatibility with server responses

interface ServerHistoryItem {
  image_id?: string
  job_id?: string
  created_at?: string
  operation?: string
  url?: string
  thumbnail_url?: string
  filename?: string
  size_bytes?: number
  prompt?: string
  elapsed_seconds?: number
  input_image_count?: number
  input_image_urls?: string[]
  mask_url?: string
}

interface ServerHistoryJob {
  job_id?: string
  created_at?: string
  operation?: string
  prompt?: string
  model?: string
  request_params?: Partial<TaskRecord['params']>
  status?: string
}

async function readJsonResponse(response: Response): Promise<any> {
  const text = await response.text()
  let payload: any = {}
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { detail: text }
    }
  }
  if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`)
  return payload
}

function parseTime(value: unknown) {
  if (typeof value !== 'string' || !value) return Date.now()
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : Date.now()
}

function historyItemToTask(item: ServerHistoryItem): TaskRecord | null {
  const jobId = item.job_id || ''
  const imageIndexMatch = String(item.url || '').match(/\/(\d+)$/)
  const imageIndex = imageIndexMatch ? Number(imageIndexMatch[1]) : 1
  const imageId = `server-${jobId}-${imageIndex || 1}`
  const url = item.url
  if (!url || !jobId) return null
  const createdAt = parseTime(item.created_at)

  const inputImageIds: string[] = []
  const serverImageUrls: Record<string, string> = { [imageId]: url }
  const serverThumbnailUrls: Record<string, string> = item.thumbnail_url ? { [imageId]: item.thumbnail_url } : {}

  if (item.input_image_urls && item.input_image_urls.length > 0) {
    for (let i = 0; i < item.input_image_urls.length; i++) {
      const inputId = `server-input-${jobId}-${i + 1}`
      inputImageIds.push(inputId)
      serverImageUrls[inputId] = item.input_image_urls[i]
    }
  }

  let maskImageId: string | undefined
  let maskTargetImageId: string | undefined
  if (item.mask_url && inputImageIds.length > 0) {
    maskImageId = `server-mask-${jobId}`
    maskTargetImageId = inputImageIds[0]
    serverImageUrls[maskImageId] = item.mask_url
  }

  return {
    id: jobId,
    prompt: item.prompt || '',
    params: { ...DEFAULT_PARAMS },
    inputImageIds,
    maskImageId,
    maskTargetImageId,
    outputImages: [imageId],
    serverJobId: jobId,
    serverImageUrls,
    serverThumbnailUrls: Object.keys(serverThumbnailUrls).length ? serverThumbnailUrls : undefined,
    status: 'done',
    error: null,
    createdAt,
    finishedAt: createdAt,
    elapsed: typeof item.elapsed_seconds === 'number' ? Math.round(item.elapsed_seconds * 1000) : null,
  }
}

function historyJobToTask(job: ServerHistoryJob): TaskRecord | null {
  const jobId = job.job_id || ''
  if (!jobId || job.status !== 'running') return null
  return {
    id: jobId,
    prompt: job.prompt || '',
    params: { ...DEFAULT_PARAMS, ...(job.request_params || {}) },
    inputImageIds: [],
    outputImages: [],
    serverJobId: jobId,
    status: 'running',
    error: null,
    createdAt: parseTime(job.created_at),
    finishedAt: null,
    elapsed: null,
  }
}

function mergeServerTask(existing: TaskRecord, serverTask: TaskRecord): TaskRecord {
  return {
    ...existing,
    ...serverTask,
    id: existing.id,
    serverJobId: serverTask.serverJobId,
    inputImageIds: existing.inputImageIds.length ? existing.inputImageIds : serverTask.inputImageIds,
    maskTargetImageId: existing.maskTargetImageId ?? serverTask.maskTargetImageId,
    maskImageId: existing.maskImageId ?? serverTask.maskImageId,
    serverImageUrls: { ...(serverTask.serverImageUrls || {}), ...(existing.serverImageUrls || {}) },
    serverThumbnailUrls: { ...(serverTask.serverThumbnailUrls || {}), ...(existing.serverThumbnailUrls || {}) },
    params: existing.params ?? serverTask.params,
    isFavorite: existing.isFavorite ?? serverTask.isFavorite,
    status: serverTask.status,
    error: serverTask.error,
    createdAt: existing.createdAt || serverTask.createdAt,
    finishedAt: serverTask.finishedAt || existing.finishedAt,
    elapsed: serverTask.elapsed ?? existing.elapsed,
  }
}

export async function loadServerHistory(webVersion: string, existingTasks: TaskRecord[] = []): Promise<TaskRecord[]> {
  const response = await fetch('/web/history?offset=0&limit=60', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'X-Web-Version': webVersion,
      'X-Web-Request': '1',
    },
  })
  const payload = await readJsonResponse(response)
  const items = Array.isArray(payload.items) ? payload.items as ServerHistoryItem[] : []
  const jobs = Array.isArray(payload.jobs) ? payload.jobs as ServerHistoryJob[] : []
  const taskMap = new Map<string, TaskRecord>()

  for (const job of jobs) {
    const task = historyJobToTask(job)
    if (task) taskMap.set(task.id, task)
  }

  for (const item of items) {
    const task = historyItemToTask(item)
    if (!task) continue
    const existing = taskMap.get(task.id)
    if (existing) {
      const imageId = task.outputImages[0]
      existing.outputImages.push(imageId)
      existing.serverImageUrls = { ...(existing.serverImageUrls || {}), ...(task.serverImageUrls || {}) }
      existing.serverThumbnailUrls = { ...(existing.serverThumbnailUrls || {}), ...(task.serverThumbnailUrls || {}) }
      if (!existing.inputImageIds.length && task.inputImageIds.length) {
        existing.inputImageIds = task.inputImageIds
        existing.maskImageId = existing.maskImageId ?? task.maskImageId
        existing.maskTargetImageId = existing.maskTargetImageId ?? task.maskTargetImageId
      }
      continue
    }
    taskMap.set(task.id, task)
  }

  const tasks = Array.from(taskMap.values())
  const serverJobIds = new Set(tasks.map((task) => task.serverJobId || task.id))

  for (const serverTask of tasks) {
    const jobId = serverTask.serverJobId || serverTask.id
    const existing = existingTasks.find((task) => task.serverJobId === jobId || task.id === jobId)
    await putTask(existing ? mergeServerTask(existing, serverTask) : serverTask)
  }

  for (const task of existingTasks) {
    const jobId = task.serverJobId || task.id
    if (task.status === 'running') {
      if (!serverJobIds.has(jobId)) taskMap.set(task.id, task)
    } else if (!serverJobIds.has(jobId)) {
      await dbDeleteTask(task.id)
    }
  }

  return Array.from(taskMap.values())
}
