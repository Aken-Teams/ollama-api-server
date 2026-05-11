import { useQuery } from '@tanstack/react-query'
import { fetchStats, fetchSystemInfo } from '@/api/stats'
import { fetchKeys } from '@/api/keys'
import { fetchModels } from '@/api/models'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import { Clock } from 'lucide-react'
import { formatNumber } from '@/lib/utils'

function Gauge({ label, percent, value, color }: { label: string; percent: number; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 text-right text-xs text-gray-400 shrink-0">{label}</div>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <div className="w-12 text-xs text-gray-600 font-mono shrink-0">{value}</div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: sysInfo } = useQuery({ queryKey: ['system-info'], queryFn: fetchSystemInfo, refetchInterval: 10000 })
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 30000 })
  const { data: keys } = useQuery({ queryKey: ['keys'], queryFn: fetchKeys })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: fetchModels })

  const activeKeys = keys?.filter(k => k.is_active).length ?? 0
  const modelsCount = models?.length ?? 0

  const chartData = (stats?.daily_requests ?? []).slice(-14).map((d: { date: string; count: number }) => ({
    date: d.date?.slice(5) ?? '',
    count: d.count ?? 0,
  }))

  const modelUsage = stats?.model_usage
    ? Object.entries(stats.model_usage as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : []

  const statCards = [
    { label: '總請求', value: formatNumber(stats?.total_requests) },
    { label: '活躍 Key', value: String(activeKeys) },
    { label: '可用模型', value: String(modelsCount) },
    { label: 'Token 用量', value: formatNumber(stats?.total_tokens) },
    { label: '成功率', value: stats?.total_requests && stats?.success_count ? `${Math.round(((stats.success_count as number) / (stats.total_requests as number)) * 100)}%` : '-' },
    { label: '平均回應', value: stats?.avg_response_time != null ? `${Math.round(stats.avg_response_time as number)}ms` : '-' },
  ]

  return (
    <div className="space-y-5">
      <h1 className="text-base font-semibold text-gray-800">總覽</h1>

      {/* Stats row */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(card => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-100 px-4 py-3">
            <div className="text-lg font-bold text-gray-900">{card.value ?? '—'}</div>
            <div className="text-xs text-gray-400 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Chart + Model usage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">每日請求（近 14 天）</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: 'none' }}
                  cursor={{ fill: '#fef3c7' }}
                />
                <Bar dataKey="count" fill="#f59e0b" radius={[3, 3, 0, 0]} name="請求數" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-36 flex items-center justify-center text-xs text-gray-300">暫無資料</div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">模型使用分布</p>
          {modelUsage.length > 0 ? (
            <div className="space-y-2.5">
              {modelUsage.map(([model, count]) => {
                const total = modelUsage.reduce((a, [, c]) => a + c, 0)
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={model}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span className="truncate max-w-[130px]">{model}</span>
                      <span className="text-gray-400 shrink-0 ml-1">{pct}%</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-36 flex items-center justify-center text-xs text-gray-300">暫無資料</div>
          )}
        </div>
      </div>

      {/* System status */}
      {sysInfo && (
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-500">主機狀態</p>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock size={11} />
              <span>運行 {sysInfo.uptime}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Gauge
              label="CPU"
              percent={sysInfo.cpu_percent}
              value={`${sysInfo.cpu_percent}%`}
              color={sysInfo.cpu_percent > 80 ? 'bg-red-400' : sysInfo.cpu_percent > 60 ? 'bg-amber-400' : 'bg-blue-400'}
            />
            <Gauge
              label="記憶體"
              percent={sysInfo.memory.percent}
              value={`${sysInfo.memory.used_gb}G`}
              color={sysInfo.memory.percent > 85 ? 'bg-red-400' : sysInfo.memory.percent > 70 ? 'bg-amber-400' : 'bg-violet-400'}
            />
            <Gauge
              label="磁碟"
              percent={sysInfo.disk.percent}
              value={`${sysInfo.disk.used_gb}G`}
              color={sysInfo.disk.percent > 90 ? 'bg-red-400' : sysInfo.disk.percent > 75 ? 'bg-amber-400' : 'bg-emerald-400'}
            />
            {sysInfo.gpu_percent != null && (
              <Gauge
                label="GPU"
                percent={sysInfo.gpu_percent}
                value={`${sysInfo.gpu_percent}%`}
                color={sysInfo.gpu_percent > 80 ? 'bg-red-400' : 'bg-orange-400'}
              />
            )}
          </div>
          <div className="flex gap-4 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400">
            <span>{sysInfo.cpu_count} 核心 · 負載 {sysInfo.load_avg[0]}</span>
            <span>{sysInfo.memory.total_gb} GB RAM</span>
            <span>{sysInfo.disk.total_gb} GB 磁碟</span>
          </div>
        </div>
      )}
    </div>
  )
}
