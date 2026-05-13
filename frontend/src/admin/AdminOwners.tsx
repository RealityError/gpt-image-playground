import { useEffect, useState, useCallback } from 'react'
import {
  adminJson,
  buildAdminQuery,
  setAdminOwnersBlocked,
  type AdminOwnerItem,
  type AdminListResponse,
} from '../lib/adminApi'

const PAGE_SIZE = 20

export default function AdminOwners() {
  const [items, setItems] = useState<AdminOwnerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [blockedOnly, setBlockedOnly] = useState(false)

  // Label editing
  const [editingOwner, setEditingOwner] = useState<AdminOwnerItem | null>(null)
  const [labelInput, setLabelInput] = useState('')
  const [noteInput, setNoteInput] = useState('')

  const fetchData = useCallback(async (reset = false) => {
    try {
      setError('')
      if (reset) setLoading(true)
      const currentOffset = reset ? 0 : offset
      const query = buildAdminQuery({
        offset: currentOffset,
        limit: PAGE_SIZE,
        search: search || undefined,
        blocked_only: blockedOnly ? 'true' : undefined,
      })
      const result: AdminListResponse<AdminOwnerItem> = await adminJson(`/admin/owners${query}`)
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
  }, [offset, search, blockedOnly])

  useEffect(() => {
    void fetchData(true)
  }, [search, blockedOnly])

  const handleBlock = async (owner: AdminOwnerItem, blocked: boolean) => {
    try {
      await setAdminOwnersBlocked(
        [{ owner_type: owner.owner_type, owner_id: owner.owner_id }],
        blocked,
        blocked ? '管理员封禁' : undefined
      )
      void fetchData(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    }
  }

  const handleSaveLabel = async () => {
    if (!editingOwner) return
    try {
      await adminJson('/admin/owners/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_type: editingOwner.owner_type,
          owner_id: editingOwner.owner_id,
          label: labelInput || null,
          note: noteInput || null,
        }),
      })
      setEditingOwner(null)
      void fetchData(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    }
  }

  const openLabelEditor = (owner: AdminOwnerItem) => {
    setEditingOwner(owner)
    setLabelInput(owner.label || '')
    setNoteInput(owner.note || '')
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索空间主..."
          className="rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-gray-900/10 w-48"
        />
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={blockedOnly}
            onChange={(e) => setBlockedOnly(e.target.checked)}
            className="rounded"
          />
          仅封禁
        </label>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {loading && <p className="text-gray-500 dark:text-gray-400">加载中...</p>}
      {!loading && items.length === 0 && <p className="text-gray-500 dark:text-gray-400">暂无数据</p>}

      {/* Owner Cards */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((owner) => (
            <div
              key={`${owner.owner_type}:${owner.owner_id}`}
              className={`rounded-2xl border bg-white dark:bg-gray-950 shadow-sm p-4 space-y-3 ${
                owner.blocked_reason
                  ? 'border-red-300 dark:border-red-800'
                  : 'border-gray-200 dark:border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {owner.label || owner.owner_hint || owner.owner_id}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {owner.owner_type}:{owner.owner_id.slice(0, 12)}
                  </p>
                  {owner.note && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{owner.note}</p>
                  )}
                </div>
                {owner.blocked_reason && (
                  <span className="shrink-0 text-xs bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-lg font-medium">
                    已封禁
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span>任务: {owner.job_count ?? 0}</span>
                <span>成功: {owner.success_jobs ?? 0}</span>
                <span>失败: {owner.failed_jobs ?? 0}</span>
                <span>图片: {owner.image_count ?? 0}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => openLabelEditor(owner)}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1"
                >
                  备注
                </button>
                {owner.blocked_reason ? (
                  <button
                    onClick={() => void handleBlock(owner, false)}
                    className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 border border-green-200 dark:border-green-800 rounded-lg px-2 py-1"
                  >
                    解封
                  </button>
                ) : (
                  <button
                    onClick={() => void handleBlock(owner, true)}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 border border-red-200 dark:border-red-800 rounded-lg px-2 py-1"
                  >
                    封禁
                  </button>
                )}
              </div>
            </div>
          ))}
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

      {/* Label Editor Modal */}
      {editingOwner && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 backdrop-blur px-4"
          onClick={() => setEditingOwner(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-white/10 shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">编辑备注</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">标签</label>
                <input
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="显示标签"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">备注</label>
                <input
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="内部备注"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => void handleSaveLabel()}
                className="rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-950 px-4 py-2.5 font-semibold text-sm"
              >
                保存
              </button>
              <button
                onClick={() => setEditingOwner(null)}
                className="rounded-xl border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 px-4 py-2.5 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

