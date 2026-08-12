'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Edit3,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { SortableCardList, type Column as CardColumn } from '@/components/ui/sortable-card-list'
import { SortableTable, type Column } from '@/components/ui/sortable-table'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'

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
  const { data: toolsData, isLoading, mutate } = useApi<Tool[]>('/api/tools', { dedupingInterval: 300_000 })
  const [submitting, setSubmitting] = useState(false)
  const [editTool, setEditTool] = useState<Tool | null>(null)
  const [deleteTool, setDeleteTool] = useState<Tool | null>(null)
  const [form, setForm] = useState<ToolForm>(emptyForm)

  const tools = toolsData?.data ?? []
  const error = !toolsData?.success ? (toolsData?.error ?? '') : ''
  const loading = isLoading

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
        ? await apiJson<Tool>(`/api/tools/${editTool.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await apiJson<Tool>('/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

      if (!data.success) {
        notifyError(data.error || 'Không lưu được dụng cụ')
        return
      }

      notifySuccess(editTool ? 'Đã cập nhật dụng cụ' : 'Đã tạo dụng cụ')
      closeForm()
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTool) return

    setSubmitting(true)
    try {
      const data = await apiJson(`/api/tools/${deleteTool.id}`, { method: 'DELETE' })
      if (!data.success) {
        notifyError(data.error || 'Không xoá được dụng cụ')
        return
      }
      notifySuccess('Đã xoá dụng cụ')
      setDeleteTool(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const isFormOpen = formOpen

  const toolColumns: Column<Tool>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Tên dụng cụ',
      cellClassName: 'px-4 py-3 font-medium text-zinc-950 dark:text-white',
      render: (item) => (
        <div className="flex items-center gap-2">
          {item.name}
          {item.isRequired && <Badge variant="purple" size="sm">Bắt buộc</Badge>}
        </div>
      ),
    },
    {
      key: 'description',
      label: 'Mô tả',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (item) => item.description || '—',
    },
    {
      key: 'quantity',
      label: 'SL chuẩn',
      cellClassName: 'px-4 py-3 text-sm tabular-nums text-zinc-950 dark:text-white',
      render: (item) => item.quantity,
    },
    {
      label: 'Thao tác',
      cellClassName: 'px-4 py-3',
      render: (item) => (
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" icon={Edit3} disabled={submitting} onClick={() => openEdit(item)} title="Sửa" />
          <Button variant="outline-danger" size="sm" icon={Trash2} disabled={submitting} onClick={() => setDeleteTool(item)} title="Xoá" />
        </div>
      ),
    },
  ], [submitting, openEdit])

  // ── Cột cho mobile card list (title + details + actions) ──
  const toolCardColumns: CardColumn<Tool>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Tên dụng cụ',
      render: (item) => (
        <span className="flex items-center gap-2 text-base font-semibold text-zinc-950 dark:text-white">
          {item.name}
          {item.isRequired && <Badge variant="purple" size="sm">Bắt buộc</Badge>}
        </span>
      ),
    },
    {
      key: 'description',
      label: 'Mô tả',
      render: (item) => item.description || '—',
    },
    {
      key: 'quantity',
      label: 'SL chuẩn',
      render: (item) => <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">{item.quantity}</span>,
    },
    {
      label: '',
      render: (item) => (
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" icon={Edit3} disabled={submitting} onClick={() => openEdit(item)} title="Sửa" />
          <Button variant="outline-danger" size="sm" icon={Trash2} disabled={submitting} onClick={() => setDeleteTool(item)} title="Xoá" />
        </div>
      ),
    },
  ], [submitting, openEdit])

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
              onClick={() => void mutate()}
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

        {/* Mobile: card list */}
        <div className="md:hidden">
          <SortableCardList
            columns={toolCardColumns}
            data={tools}
            keyExtractor={(t) => t.id}
            sortableKeys={['name', 'quantity']}
            defaultSortKey="name"
            emptyIcon={Wrench}
            emptyMessage="Chưa có dụng cụ"
            emptyDescription="Thêm dụng cụ để nhân viên kiểm đếm khi mở và đóng ca."
          />
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block">
          <SortableTable
            columns={toolColumns}
            data={tools}
            keyExtractor={(t) => t.id}
            sortableKeys={['name', 'quantity']}
            defaultSortKey="name"
            emptyIcon={Wrench}
            emptyMessage="Chưa có dụng cụ"
            emptyDescription="Thêm dụng cụ để nhân viên kiểm đếm khi mở và đóng ca."
          />
        </div>

        <ToolFormModal
          open={isFormOpen}
          tool={editTool}
          form={form}
          submitting={submitting}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={() => void handleSubmit()}
        />

        <ConfirmDialog
          open={!!deleteTool}
          onClose={() => setDeleteTool(null)}
          title="Xóa dụng cụ"
          description={deleteTool ? `Dụng cụ "${deleteTool.name}" sẽ bị xóa vĩnh viễn.` : undefined}
          confirmLabel="Xóa"
          submitting={submitting}
          onConfirm={handleConfirmDelete}
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
