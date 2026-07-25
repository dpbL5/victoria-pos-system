'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Edit3,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { apiJson } from '@/features/pos/api'

function mutationRequest(method: string, body?: unknown): RequestInit {
  const headers: Record<string, string> = body ? { 'Content-Type': 'application/json' } : {}
  const csrfToken = typeof document !== 'undefined'
    ? document.cookie.match(/(?:^|;\s*)qltrungcung_csrf=([^;]*)/)?.[1]
    : null
  if (csrfToken) headers['X-CSRF-Token'] = decodeURIComponent(csrfToken)
  return {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }
}

interface Tool {
  id: string
  name: string
  description: string | null
  quantity: number
  isRequired: boolean
  order: number
  createdAt: string
}

interface ToolForm {
  name: string
  description: string
  quantity: string
  isRequired: boolean
  order: string
}

const emptyForm: ToolForm = {
  name: '',
  description: '',
  quantity: '0',
  isRequired: false,
  order: '0',
}

export function ToolsScreen() {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editTool, setEditTool] = useState<Tool | null>(null)
  const [form, setForm] = useState<ToolForm>(emptyForm)

  const loadTools = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiJson<Tool[]>('/api/tools')
      if (!data.success) throw new Error(data.error || 'Không tải được danh sách dụng cụ')
      setTools(data.data ?? [])
    } catch (err) {
      setError((err as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTools()
  }, [loadTools])

  const [formOpen, setFormOpen] = useState(false)

  const openCreate = () => {
    setEditTool(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  const openEdit = (tool: Tool) => {
    setEditTool(tool)
    setForm({
      name: tool.name,
      description: tool.description ?? '',
      quantity: String(tool.quantity),
      isRequired: tool.isRequired,
      order: String(tool.order),
    })
    setFormOpen(true)
  }

  const closeForm = () => {
    setEditTool(null)
    setForm(emptyForm)
    setFormOpen(false)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      notifyError('Tên dụng cụ không được để trống')
      return
    }

    setSubmitting(true)
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        quantity: Number(form.quantity) || 0,
        isRequired: form.isRequired,
        order: Number(form.order) || 0,
      }

      const data = editTool
        ? await apiJson<Tool>(`/api/tools/${editTool.id}`, mutationRequest('PATCH', body))
        : await apiJson<Tool>('/api/tools', mutationRequest('POST', body))

      if (!data.success) {
        notifyError(data.error || 'Không lưu được dụng cụ')
        return
      }

      notifySuccess(editTool ? 'Đã cập nhật dụng cụ' : 'Đã tạo dụng cụ')
      closeForm()
      await loadTools()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (tool: Tool) => {
    setSubmitting(true)
    try {
      const data = await apiJson(`/api/tools/${tool.id}`, mutationRequest('DELETE'))
      if (!data.success) {
        notifyError(data.error || 'Không xoá được dụng cụ')
        return
      }
      notifySuccess('Đã xoá dụng cụ')
      await loadTools()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const isFormOpen = formOpen

  if (loading) {
    return (
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Quản lý dụng cụ
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-zinc-950 dark:text-white">
              <Wrench size={24} className="text-amber-500" />
              Dụng cụ quầy
            </h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => void loadTools()}
              title="Làm mới"
            />
            <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
              Thêm
            </Button>
          </div>
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        {tools.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <EmptyState
              icon={Wrench}
              message="Chưa có dụng cụ"
              description="Thêm dụng cụ để nhân viên kiểm đếm khi mở và đóng ca."
              action={
                <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
                  Thêm dụng cụ
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            {tools.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                      {tool.name}
                    </p>
                    {tool.isRequired && (
                      <Badge variant="purple" size="sm">Bắt buộc</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {tool.description && <span>{tool.description}</span>}
                    {tool.quantity > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1 w-1 rounded-full bg-zinc-400" />
                        SL chuẩn: <span className="font-medium text-zinc-700 dark:text-zinc-300">{tool.quantity}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="secondary"
                    size="xs"
                    icon={Edit3}
                    disabled={submitting}
                    onClick={() => openEdit(tool)}
                    title="Sửa"
                  />
                  <Button
                    variant="outline-danger"
                    size="xs"
                    icon={Trash2}
                    disabled={submitting}
                    onClick={() => void handleDelete(tool)}
                    title="Xoá"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <ToolFormModal
          open={isFormOpen}
          tool={editTool}
          form={form}
          submitting={submitting}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={() => void handleSubmit()}
        />
      </div>
    </div>
  )
}

function ToolFormModal({
  open,
  tool,
  form,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean
  tool: Tool | null
  form: ToolForm
  submitting: boolean
  onChange: (form: ToolForm) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tool ? 'Sửa dụng cụ' : 'Thêm dụng cụ'}
      size="md"
      footer={
        <Button
          variant="inverse"
          size="lg"
          fullWidth
          disabled={submitting || !form.name.trim()}
          onClick={onSubmit}
        >
          {submitting ? 'Đang lưu...' : tool ? 'Cập nhật' : 'Tạo dụng cụ'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="tool-name" required>Tên dụng cụ</Label>
          <Input
            id="tool-name"
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder="VD: Gạt tên, Bút bi, Giấy in..."
          />
        </div>
        <div>
          <Label htmlFor="tool-desc">Mô tả</Label>
          <Input
            id="tool-desc"
            value={form.description}
            onChange={(event) => onChange({ ...form, description: event.target.value })}
            placeholder="Mô tả ngắn (tuỳ chọn)"
          />
        </div>
        <div>
          <Label htmlFor="tool-quantity">Số lượng chuẩn</Label>
          <Input
            id="tool-quantity"
            type="number"
            min={0}
            value={form.quantity}
            onChange={(event) => onChange({ ...form, quantity: event.target.value })}
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Số lượng cần có trong quầy. Nhân viên sẽ đối chiếu số thực tế với số này.
          </p>
        </div>
        <div>
          <Label htmlFor="tool-order">Thứ tự hiển thị</Label>
          <Input
            id="tool-order"
            type="number"
            min={0}
            value={form.order}
            onChange={(event) => onChange({ ...form, order: event.target.value })}
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Số càng nhỏ hiển thị trước.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <input
            type="checkbox"
            id="tool-required"
            checked={form.isRequired}
            onChange={(event) => onChange({ ...form, isRequired: event.target.checked })}
            className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <Label htmlFor="tool-required">Bắt buộc kiểm đếm</Label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Nhân viên bắt buộc phải nhập số lượng khi mở/đóng ca
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
