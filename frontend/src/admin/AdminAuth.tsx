import { useEffect, useState, useCallback } from 'react'
import {
  adminJson,
  buildAdminQuery,
  type AdminAuthEvent,
  type AdminListResponse,
} from '../lib/adminApi'

const PAGE_SIZE = 20

function formatDate(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

export default function AdminAuth() {
  const [items, setItems] = useState<AdminAuthEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('')
  const [successOnly, setSuccessOnly] = useState(false)

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
        success_only: successOnly ? 'true' : undefined,
      })
      const result: AdminListResponse<AdminAuthEvent> = await adminJson(`/admin/auth-events${query}`)
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
  }, [offset, search, scope, successOnly])

  useEffect(() => {
    void fetchData(true)
  }, [search, scope, successOnly])

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索IP/事件..."
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
          <option value="admin">Admin</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={successOnly}
            onChange={(e) => setSuccessOnly(e.target.checked)}
            className="rounded"
          />
          仅成功
        </label>
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
                <th className="p-3">时间</th>
                <th className="p-3">来源</th>
                <th className="p-3">事件</th>
                <th className="p-3">结果</th>
                <th className="p-3">IP</th>
                <th className="p-3">详情</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id ?? i} className="border-b border-gray-100 dark:border-white/5">
                  <td className="p-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatDate(item.created_at)}
                  </td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{item.scope || '-'}</td>
                  <td className="p-3 text-gray-700 dark:text-gray-300">{item.event_type || '-'}</td>
                  <td className="p-3">
                    {item.success ? (
                      <span className="inline-flex items-center rounded-lg bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 px-2 py-0.5 text-xs font-medium">
                        成功
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 px-2 py-0.5 text-xs font-medium">
                        失败
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-gray-500 dark:text-gray-400 font-mono">{item.client_ip || '-'}</td>
                  <td className="p-3 text-xs text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{item.detail || '-'}</td>
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
    </div>
  )
}
