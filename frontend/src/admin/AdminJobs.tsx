import { useEffect, useState, useCallback } from 'react'
import {
  adminJson,
  buildAdminQuery,
  softDeleteAdminJobs,
  type AdminJobItem,
  type AdminListResponse,
} from '../lib/adminApi'

const PAGE_SIZE = 20

function formatDate(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

function formatSeconds(value?: number | null) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return '-'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

export default function AdminJobs() {
  const [items, setItems] = useState<AdminJobItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('')
  const [status, setStatus] = useState('')
  const [operation, setOperation] = useState('')
  const [deleted, setDeleted] = useState(false)

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<AdminJobItem | null>(null)

  const fetchData = useCallback(async (reset = false) => {
    try {
      setError('')
      if (reset) setLoading(true)
      const currentOffset = reset ? 0 : offset
      const query = buildAdminQuery({
        offset: currentOffset,
        limit: PAGE_SIZE,
        search: search || undefined,
        scope: scope || undefined,
        status: status || undefined,
        operation: operation || undefined,
        include_deleted: deleted ? 'true' : undefined,
      })
      const result: AdminListResponse<AdminJobItem> = await adminJson(`/admin/jobs${query}`)
      if (reset) {
        setItems(result.items)
        setOffset(result.items.length)
      } else {
        setItems((prev) => [...prev, ...result.items])
        setOffset(currentOffset + result.items.length)
      }
      setHasMore(Boolean(result.has_more))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [offset, search, scope, status, operation, deleted])

  useEffect(() => {
    void fetchData(true)
  }, [search, scope, status, operation, deleted])

  const toggleSelect = (jobId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const handleBatchDelete = async () => {
    if (selected.size === 0) return
    try {
      await softDeleteAdminJobs(Array.from(selected), '管理员批量删除')
      setSelected(new Set())
      void fetchData(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

  const statusBadge = (s?: string | null) => {
    if (s === 'success') return <span className="inline-flex items-center rounded-lg bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 px-2 py-0.5 text-xs font-medium">成功</span>
    if (s === 'failed') return <span className="inline-flex items-center rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 px-2 py-0.5 text-xs font-medium">失败</span>
    if (s === 'running') return <span className="inline-flex items-center rounded-lg bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 text-xs font-medium">运行中</span>
    return <span className="inline-flex items-center rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 px-2 py-0.5 text-xs font-medium">{s || '-'}</span>
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索提示词/ID..."
          className="rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-gray-900/10 w-48"
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none"
        >
          <option value="">全部来源</option>
          <option value="web">Web</option>
          <option value="api">API</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="running">运行中</option>
        </select>
        <select
          value={operation}
          onChange={(e) => setOperation(e.target.value)}
          className="rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none"
        >
          <option value="">全部操作</option>
          <option value="generate">生成</option>
          <option value="edit">编辑</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={deleted}
            onChange={(e) => setDeleted(e.target.checked)}
            className="rounded"
          />
          含已删除
        </label>
        {selected.size > 0 && (
          <button
            onClick={() => void handleBatchDelete()}
            className="rounded-xl bg-red-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-red-700"
          >
            删除选中 ({selected.size})
          </button>
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {loading && <p className="text-gray-500 dark:text-gray-400">加载中...</p>}
      {!loading && items.length === 0 && <p className="text-gray-500 dark:text-gray-400">暂无数据</p>}

      {/* Table */}
      {items.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/10 text-left text-gray-500 dark:text-gray-400">
                <th className="p-3 w-8"></th>
                <th className="p-3">Job ID</th>
                <th className="p-3">时间</th>
                <th className="p-3">状态</th>
                <th className="p-3">来源</th>
                <th className="p-3">操作</th>
                <th className="p-3">提示词</th>
                <th className="p-3">耗时</th>
                <th className="p-3">图片数</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.job_id}
                  className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                  onClick={() => setDetail(item)}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.job_id)}
                      onChange={() => toggleSelect(item.job_id)}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-600 dark:text-gray-400">{item.job_id.slice(0, 8)}</td>
                  <td className="p-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(item.created_at)}</td>
                  <td className="p-3">{statusBadge(item.status)}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{item.scope || '-'}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{item.operation || '-'}</td>
                  <td className="p-3 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{item.prompt_preview || '-'}</td>
                  <td className="p-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatSeconds(item.elapsed_seconds)}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{item.image_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Load More */}
      {hasMore && !loading && (
        <div className="flex justify-center">
          <button
            onClick={() => void fetchData(false)}
            className="rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-950 px-4 py-2.5 font-semibold text-sm"
          >
            加载更多
          </button>
        </div>
      )}

      {/* Detail Panel */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 backdrop-blur px-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-white/10 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">任务详情</h3>
              <button
                onClick={() => setDetail(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg"
              >
                &times;
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="Job ID" value={detail.job_id} />
              <DetailRow label="状态" value={detail.status || '-'} />
              <DetailRow label="来源" value={detail.scope || '-'} />
              <DetailRow label="操作" value={detail.operation || '-'} />
              <DetailRow label="模型" value={detail.model || '-'} />
              <DetailRow label="创建时间" value={formatDate(detail.created_at)} />
              <DetailRow label="完成时间" value={formatDate(detail.completed_at)} />
              <DetailRow label="耗时" value={formatSeconds(detail.elapsed_seconds)} />
              <DetailRow label="图片数" value={String(detail.image_count ?? 0)} />
              <DetailRow label="IP" value={detail.client_ip || '-'} />
              <DetailRow label="空间" value={detail.owner_label || detail.owner_hint || detail.owner_id || '-'} />
              <DetailRow label="输入图片" value={String(detail.input_image_count ?? 0)} />
            </div>
            {detail.prompt && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">提示词</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{detail.prompt}</p>
              </div>
            )}
            {detail.error_message && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">错误信息</p>
                <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{detail.error_message}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 dark:text-gray-400">{label}: </span>
      <span className="text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  )
}