import { useEffect, useState } from 'react'
import { adminJson, getAdminConfig, setAdminConfig, type AdminConfigItem, type AdminSystemStatus } from '../lib/adminApi'

function formatBytes(size?: number | null) {
  const value = Number(size)
  if (!Number.isFinite(value)) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function AdminSystem() {
  const [data, setData] = useState<AdminSystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const result = await adminJson('/admin/system')
        setData(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <p className="text-gray-500 dark:text-gray-400">加载中...</p>
  if (error) return <p className="text-red-500">{error}</p>
  if (!data) return <p className="text-gray-500 dark:text-gray-400">暂无数据</p>

  const live = data.live
  const disk = data.disk
  const workers = data.workers
  const version = data.version

  return (
    <div className="space-y-5">
      {/* Runtime Config */}
      <RuntimeConfigCard />

      {/* Live Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="在线用户" value={live?.active_users ?? 0} />
        <MetricCard label="生成中" value={live?.active_generations ?? 0} />
        <MetricCard label="Web会话" value={live?.web_sessions ?? 0} />
        <MetricCard label="存储使用" value={disk ? formatBytes(disk.used_bytes) : '-'} />
      </div>

      {/* Disk Usage */}
      {disk && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">磁盘使用</h3>
          <div className="w-full h-3 bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 dark:bg-gray-100 rounded-full transition-all"
              style={{ width: `${Math.min(disk.used_percent ?? 0, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>已用 {formatBytes(disk.used_bytes)} ({(disk.used_percent ?? 0).toFixed(1)}%)</span>
            <span>总计 {formatBytes(disk.total_bytes)}</span>
          </div>
        </div>
      )}

      {/* Version Info */}
      {version && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">版本信息</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {version.web_client_version && (
              <InfoRow label="Web客户端" value={version.web_client_version} />
            )}
            {version.api_version && (
              <InfoRow label="API版本" value={version.api_version} />
            )}
            {version.model && (
              <InfoRow label="模型" value={version.model} />
            )}
          </div>
        </div>
      )}

      {/* Worker Config */}
      {workers && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Worker 配置</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {workers.background_generation_workers != null && (
              <InfoRow label="后台生成Worker" value={String(workers.background_generation_workers)} />
            )}
            {workers.web_concurrency_per_session != null && (
              <InfoRow label="Web并发/会话" value={String(workers.web_concurrency_per_session)} />
            )}
            {workers.api_concurrency_per_ip != null && (
              <InfoRow label="API并发/IP" value={String(workers.api_concurrency_per_ip)} />
            )}
          </div>
        </div>
      )}

      {/* Storage breakdown */}
      {data.storage && Object.keys(data.storage).length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">存储明细</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(data.storage).map(([key, value]) => (
              <InfoRow key={key} label={key} value={formatBytes(value)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RuntimeConfigCard() {
  const [items, setItems] = useState<AdminConfigItem[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const res = await getAdminConfig()
        setItems(res.items)
        const v: Record<string, string> = {}
        for (const item of res.items) v[item.key] = item.value
        setValues(v)
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载配置失败')
      }
    })()
  }, [])

  const save = async (key: string) => {
    setSaving(key)
    setError('')
    setSuccess('')
    try {
      await setAdminConfig({ [key]: values[key] })
      setSuccess(`${key} 已保存`)
      setTimeout(() => setSuccess(''), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(null)
    }
  }

  if (!items.length && !error) return null

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">运行时配置</h3>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-green-600 dark:text-green-400">{success}</p>}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <label className="text-sm text-gray-500 dark:text-gray-400 w-36 shrink-0">{item.label}</label>
            <input
              type={item.type === 'str' ? 'text' : 'number'}
              value={values[item.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [item.key]: e.target.value }))}
              min={item.min}
              max={item.max}
              className="flex-1 min-w-0 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-gray-900/10"
            />
            <button
              onClick={() => void save(item.key)}
              disabled={saving === item.key}
              className="shrink-0 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-950 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              {saving === item.key ? '...' : '保存'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
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
