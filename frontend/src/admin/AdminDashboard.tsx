import { useEffect, useState } from 'react'
import { adminJson, type AdminDashboard as DashboardData, type AdminJobItem } from '../lib/adminApi'

function formatSeconds(value?: number | null) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return '-'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = async () => {
    try {
      setError('')
      const result = await adminJson('/admin/dashboard')
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
    const timer = window.setInterval(() => void fetchData(), 10000)
    return () => window.clearInterval(timer)
  }, [])

  if (loading) return <p className="text-gray-500 dark:text-gray-400">加载中...</p>
  if (error) return <p className="text-red-500">{error}</p>
  if (!data) return <p className="text-gray-500 dark:text-gray-400">暂无数据</p>

  const overview = data.overview
  const live = data.live
  const successRate = overview && overview.jobs_today
    ? ((overview.success_today || 0) / overview.jobs_today * 100).toFixed(1) + '%'
    : '-'

  return (
    <div className="space-y-5">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard label="今日任务" value={overview?.jobs_today ?? 0} />
        <MetricCard label="成功率" value={successRate} />
        <MetricCard label="进行中" value={live?.active_generations ?? overview?.running_jobs ?? 0} />
        <MetricCard label="总图片数" value={overview?.total_images ?? 0} />
        <MetricCard label="空间数" value={overview?.owner_spaces ?? 0} />
      </div>

      {/* Live Stats */}
      {live && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">实时状态</h3>
          <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
            <span>在线用户: {live.active_users ?? 0}</span>
            <span>生成中: {live.active_generations ?? 0}</span>
            <span>Web会话: {live.web_sessions ?? 0}</span>
          </div>
        </div>
      )}

      {/* Recent Failures */}
      {data.recent_failures && data.recent_failures.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            最近失败 ({data.recent_failures.length})
          </h3>
          <div className="space-y-2">
            {data.recent_failures.slice(0, 10).map((job: AdminJobItem) => (
              <div key={job.job_id} className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 dark:text-gray-500 text-xs shrink-0">
                  {formatDate(job.created_at)}
                </span>
                <span className="inline-flex items-center rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 px-2 py-0.5 text-xs font-medium">
                  失败
                </span>
                <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                  {job.prompt_preview || job.error_message || job.job_id}
                </span>
                <span className="text-gray-400 dark:text-gray-500 text-xs shrink-0">
                  {formatSeconds(job.elapsed_seconds)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Size Stats */}
      {data.size_stats && data.size_stats.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">尺寸统计</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.size_stats.map((s, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100">{s.size || '未知'}</span>
                <span className="text-gray-500 dark:text-gray-400 ml-2">
                  {s.total_jobs ?? 0}次 / 成功{s.success_jobs ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
