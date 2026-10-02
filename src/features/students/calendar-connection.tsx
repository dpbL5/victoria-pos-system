'use client'
import { useState } from 'react'
import { CalendarCheck, RefreshCw, Settings2 } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import { formatVnDateTime } from '@/lib/shared/utils'
import { Button } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import type { CalendarStatus } from './types'

/** Trạng thái đồng bộ Google — dùng chung cho chấm cảnh báo trên nút ⋯ và modal kết nối (SWR gộp theo key). */
export function useCalendarStatus() {
  const { data, mutate } = useApi<CalendarStatus>('/api/google/status', {
    refreshInterval: latest => latest?.success && (latest.data?.pending ?? 0) > 0 ? 10000 : 0,
  })
  const status = data?.data
  const needsAttention = !!status?.needsReconnect || (status?.failed ?? 0) > 0 || (status?.pending ?? 0) > 0
  return { status, mutate, needsAttention }
}

export function CalendarConnection({ menuItem = false, onOpen, compact = false }: { menuItem?: boolean; onOpen?: () => void; compact?: boolean } = {}) {
  const { status, mutate, needsAttention } = useCalendarStatus()
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmChange, setConfirmChange] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const { data: calendars } = useApi<{ id: string; summary: string }[]>(open && status?.connected ? '/api/google/calendars' : null)
  const { data: jobs } = useApi<{ entityKey: string; title: string; lastError: string | null }[]>(open && status?.connected ? '/api/google/jobs' : null)
  const toast = useToast()
  async function action(url: string, method: string, body?: unknown) {
    setBusy(true)
    try {
      const result = await apiJson(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      if (!result.success) { toast.error(result.error || 'Không cập nhật được kết nối'); return }
      toast.success('Đã cập nhật Google Calendar')
      setConfirmChange(false); setConfirmDisconnect(false)
      await mutate()
    } catch { toast.error('Không kết nối được máy chủ') }
    finally { setBusy(false) }
  }
  /** Nút "Đồng bộ với Google Calendar" — job được xử lý ngay trong request, không cần worker nền. */
  async function syncNow() {
    setBusy(true)
    try {
      const result = await apiJson<{ queued: boolean; processed: number; remaining?: number; syncError?: string }>('/api/google/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!result.success) { toast.error(result.error || 'Không đồng bộ được Google Calendar'); return }
      const processed = result.data?.processed ?? 0
      const remaining = result.data?.remaining ?? 0
      if (result.data?.syncError) toast.error(processed ? `Đã đồng bộ ${processed} mục · ${result.data.syncError}` : result.data.syncError)
      else if (remaining > 0) toast.success(`Đã đồng bộ ${processed} mục · còn ${remaining} mục đang chờ, bấm lại để tiếp tục`)
      else toast.success(processed ? `Đã đồng bộ ${processed} mục lên Google Calendar` : 'Không có mục nào cần đồng bộ')
      await mutate()
    } catch { toast.error('Không kết nối được máy chủ') }
    finally { setBusy(false) }
  }
  const triggerLabel = status?.needsReconnect ? 'Kết nối lại Google' : status?.failed ? `Google: ${status.failed} lỗi` : status?.pending ? `Google: ${status.pending} chờ` : 'Google Calendar'
  const triggerText = status?.needsReconnect ? 'Kết nối lại Google Calendar' : status?.connected ? status.email ?? 'Tài khoản Google đã kết nối' : 'Kết nối Google Calendar'
  const TriggerIcon = status?.connected && !status.needsReconnect ? CalendarCheck : Settings2
  return <>
    {menuItem ? (
      <button
        type="button"
        onClick={() => { setOpen(true); onOpen?.() }}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <TriggerIcon size={16} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
      </button>
    ) : compact ? (
      <span className="relative inline-flex">
        <Button variant="ghost" icon={TriggerIcon} size="sm" aria-label="Liên kết tài khoản Google" title={triggerText} onClick={() => setOpen(true)} />
          {needsAttention && <span className="pointer-events-none absolute right-0.5 top-0.5 size-2 rounded-full bg-warning-bg0 ring-2 ring-surface-secondary" aria-hidden />}
      </span>
    ) : (
    <Button variant="white" size="sm" icon={TriggerIcon} aria-label="Google Calendar" title="Google Calendar" onClick={() => setOpen(true)}>
        <span className="lg:inline">{triggerText}</span>
      </Button>
    )}
    <Modal open={open} onClose={() => setOpen(false)} title="Google Calendar" variant="sheet">
      <div className="space-y-4 dark:[&_input]:[color-scheme:dark]">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Lịch học đồng bộ một chiều từ ứng dụng lên lịch của bạn. Hãy chỉnh lịch trong ứng dụng; các thay đổi trên Google không được nhập về.</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Mỗi quản trị viên kết nối tài khoản Google của riêng mình. Sửa lịch trong ứng dụng không tự đồng bộ — bấm “Đồng bộ với Google Calendar” thì lịch mới được đẩy lên.</p>
          {!status?.isConfigured && <p className="text-sm text-warning">Google Calendar chưa được cấu hình. Liên hệ người quản trị hệ thống.</p>}
        {status?.isConfigured && <Button variant="contrast" disabled={busy} onClick={() => { window.location.href = '/api/google/connect' }}>{status.connected ? 'Kết nối lại tài khoản Google' : 'Kết nối Google Calendar'}</Button>}
        {status?.connected && <>
          <div><Label htmlFor="google-calendar">Lịch CLB</Label><Select id="google-calendar" value={chosen || status.calendarId || ''} onChange={e => setChosen(e.target.value)}><option value="">Chọn lịch có quyền chỉnh sửa</option>{calendars?.data?.map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}</Select></div>
            {calendars?.success === false && <p className="text-sm text-danger">{calendars.error}</p>}
        <Button variant="contrast" disabled={busy || !chosen} onClick={() => status.calendarId && status.calendarId !== chosen ? setConfirmChange(true) : void action('/api/google/calendars', 'PUT', { calendarId: chosen })}>Lưu lịch đích</Button>
      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700"><Button variant="white" icon={RefreshCw} disabled={busy || !status.calendarId} onClick={() => void syncNow()}>{busy ? 'Đang đồng bộ...' : 'Đồng bộ toàn bộ lịch'}</Button><p className="mt-2 text-xs text-zinc-500">Đang chờ: {status.pending ?? 0} · Lỗi: {status.failed ?? 0}</p></div>
          {status.lastSyncedAt && <p className="text-xs text-zinc-500">Đồng bộ gần nhất: {formatVnDateTime(status.lastSyncedAt)}</p>}
      {jobs?.data?.filter(j => j.lastError).map(j => <p key={j.entityKey} className="text-sm text-danger">{j.title}: {j.lastError}</p>)}
    <Button variant="red" disabled={busy} onClick={() => setConfirmDisconnect(true)}>Ngắt kết nối</Button>
        </>}
      </div>
    </Modal>
    <ConfirmDialog open={confirmChange} title="Đổi lịch Google?" description="Ứng dụng sẽ đồng bộ sang lịch mới. Các sự kiện trên lịch cũ được giữ nguyên; hãy kiểm tra lịch cũ để tránh xem trùng." confirmLabel="Đổi lịch" onClose={() => setConfirmChange(false)} onConfirm={() => void action('/api/google/calendars', 'PUT', { calendarId: chosen, confirmChange: true })} submitting={busy} />
    <ConfirmDialog open={confirmDisconnect} title="Ngắt kết nối Google Calendar?" description="Lịch trong ứng dụng và các sự kiện đã có trên Google được giữ nguyên." confirmLabel="Ngắt kết nối" onClose={() => setConfirmDisconnect(false)} onConfirm={() => void action('/api/google/disconnect', 'POST')} submitting={busy} />
  </>
}
