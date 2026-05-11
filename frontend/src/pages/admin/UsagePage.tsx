import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchUsage } from '@/api/stats'
import type { UsageRecord } from '@/api/stats'
import { formatDate } from '@/lib/utils'
import { Loader2, Activity, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 100

export default function UsagePage() {
  const [page, setPage] = useState(0)
  const [usernameFilter, setUsernameFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['usage', page, usernameFilter],
    queryFn: () => fetchUsage({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, username: usernameFilter || undefined }),
  })

  const records = data?.logs ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">使用記錄</h1>
          <p className="text-sm text-gray-500 mt-1">查看所有 API 呼叫記錄</p>
        </div>
        <input
          value={usernameFilter}
          onChange={e => { setUsernameFilter(e.target.value); setPage(0) }}
          placeholder="篩選使用者..."
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-48"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-amber-500 mr-2" />
            <span className="text-gray-500">載入中...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Activity size={40} className="mb-3 opacity-30" />
            <p className="text-sm">暫無使用記錄</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-7 text-xs font-medium text-gray-500">
                <span>使用者</span>
                <span className="col-span-2">端點 / 模型</span>
                <span className="text-right">Prompt</span>
                <span className="text-right">Completion</span>
                <span className="text-right">回應時間</span>
                <span className="text-right">時間</span>
              </div>
            </div>
            <div className="divide-y divide-gray-100 overflow-auto max-h-[60vh]">
              {records.map((r: UsageRecord, i: number) => (
                <div key={r.id ?? i} className={`px-5 py-2.5 grid grid-cols-7 text-sm hover:bg-gray-50 ${r.status_code && r.status_code >= 400 ? 'bg-red-50/40' : ''}`}>
                  <div className="text-gray-700 truncate text-xs">{r.username ?? '-'}</div>
                  <div className="col-span-2 min-w-0">
                    <div className="text-gray-500 text-xs truncate">{r.endpoint ?? ''}</div>
                    <div className="text-gray-700 font-mono text-xs truncate">{r.model ?? '-'}</div>
                  </div>
                  <div className="text-right text-gray-600 text-xs">{r.prompt_tokens ?? '-'}</div>
                  <div className="text-right text-gray-600 text-xs">{r.completion_tokens ?? '-'}</div>
                  <div className="text-right text-gray-600 text-xs">
                    {r.response_time_ms != null ? `${Math.round(r.response_time_ms)}ms` : '-'}
                  </div>
                  <div className="text-right text-gray-400 text-xs">{formatDate(r.request_at ?? '')}</div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
              <span>共 {total} 筆</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs">{page + 1} / {Math.max(1, totalPages)}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
