import { useEffect, useState, useCallback } from 'react'
import {
  adminJson,
  buildAdminQuery,
  softDeleteAdminImages,
  type AdminGalleryItem,
  type AdminImageTarget,
  type AdminListResponse,
} from '../lib/adminApi'

const PAGE_SIZE = 20

export default function AdminGallery() {
  const [items, setItems] = useState<AdminGalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('')
  const [operation, setOperation] = useState('')
  const [deleted, setDeleted] = useState(false)

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<AdminGalleryItem | null>(null)

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
        operation: operation || undefined,
        include_deleted: deleted ? 'true' : undefined,
      })
      const result: AdminListResponse<AdminGalleryItem> = await adminJson(`/admin/gallery${query}`)
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
  }, [offset, search, scope, operation, deleted])

  useEffect(() => {
    void fetchData(true)
  }, [search, scope, operation, deleted])

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleBatchDelete = async () => {
    if (selected.size === 0) return
    const targets: AdminImageTarget[] = Array.from(selected).map((key) => {
      const [job_id, image_index] = key.split('::')
      return { job_id, image_index: Number(image_index) }
    })
    try {
      await softDeleteAdminImages(targets, '管理员批量删除')
      setSelected(new Set())
      void fetchData(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

  const itemKey = (item: AdminGalleryItem) => `${item.job_id}::${item.image_index}`

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

      {/* Error */}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Loading */}
      {loading && <p className="text-gray-500 dark:text-gray-400">加载中...</p>}

      {/* Empty */}
      {!loading && items.length === 0 && <p className="text-gray-500 dark:text-gray-400">暂无数据</p>}

      {/* Image Grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map((item) => {
            const key = itemKey(item)
            const isSelected = selected.has(key)
            return (
              <div
                key={key}
                className={`group relative rounded-2xl border overflow-hidden cursor-pointer transition-all ${
                  isSelected
                    ? 'border-gray-900 dark:border-gray-100 ring-2 ring-gray-900/20 dark:ring-gray-100/20'
                    : 'border-gray-200 dark:border-white/10'
                } bg-white dark:bg-gray-950 shadow-sm`}
              >
                <div className="aspect-square bg-gray-100 dark:bg-gray-900">
                  <img
                    src={`/admin/thumbs/${item.job_id}/${item.image_index}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onClick={() => setDetail(item)}
                  />
                </div>
                {/* Checkbox */}
                <div className="absolute top-2 left-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(key)}
                    className="w-4 h-4 rounded"
                  />
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-white truncate">{item.prompt_preview || item.prompt || '-'}</p>
                </div>
                {item.deleted_at && (
                  <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">
                    已删除
                  </div>
                )}
              </div>
            )
          })}
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

      {/* Detail Modal */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 backdrop-blur px-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-white/10 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">图片详情</h3>
              <button
                onClick={() => setDetail(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg"
              >
                &times;
              </button>
            </div>
            <img
              src={`/admin/images/${detail.job_id}/${detail.image_index}`}
              alt=""
              className="w-full rounded-xl"
            />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <InfoRow label="Job ID" value={detail.job_id} />
              <InfoRow label="来源" value={detail.scope || '-'} />
              <InfoRow label="操作" value={detail.operation || '-'} />
              <InfoRow label="模型" value={detail.model || '-'} />
              <InfoRow label="创建时间" value={detail.created_at?.replace('T', ' ').slice(0, 19) || '-'} />
              <InfoRow label="耗时" value={detail.elapsed_seconds ? `${detail.elapsed_seconds.toFixed(1)}s` : '-'} />
              <InfoRow label="空间" value={detail.owner_label || detail.owner_hint || detail.owner_id || '-'} />
              <InfoRow label="IP" value={detail.client_ip || '-'} />
            </div>
            {detail.prompt && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">提示词</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{detail.prompt}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 dark:text-gray-400">{label}: </span>
      <span className="text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  )
}
