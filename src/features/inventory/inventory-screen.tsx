'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Package,
  PackagePlus,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FilterButton } from '@/components/ui/filter-button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton, SkeletonPage, SkeletonPanel, SkeletonStats } from '@/components/ui/skeleton'
import { SortableCardList, type Column as CardColumn } from '@/components/ui/sortable-card-list'
import { SortableTable, type Column } from '@/components/ui/sortable-table'
import { useToast } from '@/components/ui/toast'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { useApi } from '@/hooks/use-api'
import { apiJson, jsonRequest } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { money, toNumber } from '@/features/pos/format'
import type { Product, ProductType, UserSession } from '@/features/pos/types'

type InventoryFilter = 'ALL' | 'LOW_STOCK' | ProductType
type StockMovementType = 'RESTOCK' | 'ADJUSTMENT'

export function InventoryScreen() {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [filter, setFilter] = useState<InventoryFilter>('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [movementProduct, setMovementProduct] = useState<Product | null>(null)
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: productData, isLoading: prodLoading, mutate } = useApi<Product[]>('/api/products?isActive=true', { dedupingInterval: 300_000 })
  const { data: userData, isLoading: userLoading } = useApi<UserSession>('/api/auth/me', { dedupingInterval: 600_000 })

  const { registerRefresh } = usePageRefresh()

  useEffect(() => {
    return registerRefresh(() => void mutate())
  }, [registerRefresh, mutate])

  const products: Product[] = productData?.data ?? []
  const error = !productData?.success ? (productData?.error as string ?? '') : ''
  const loading = prodLoading || userLoading
  const user = userData?.data ?? null

  const canManageStock = isManagerOrAdmin(user?.role)
  const lowStockProducts = useMemo(
    () => products.filter((product) => isLowStock(product)),
    [products]
  )

  const stats = useMemo(() => ({
    total: products.length,
    lowStock: lowStockProducts.length,
    productCount: products.filter((product) => product.type === 'PRODUCT').length,
    serviceCount: products.filter((product) => product.type === 'SERVICE').length,
    stockUnits: products.reduce((sum, product) =>
      product.type === 'PRODUCT' ? sum + product.stockQuantity : sum,
    0),
  }), [products, lowStockProducts.length])

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesFilter =
        filter === 'ALL'
        || (filter === 'LOW_STOCK' && isLowStock(product))
        || product.type === filter

      return matchesFilter
    })
  }, [products, filter])

  const refreshAfterChange = async (message: string) => {
    notifySuccess(message)
    setCreateOpen(false)
    setMovementProduct(null)
    setDeleteProduct(null)
    await mutate()
  }

  const handleDelete = useCallback(async () => {
    if (!deleteProduct) return
    setSubmitting(true)
    try {
      const data = await apiJson(`/api/products/${deleteProduct.id}`, { method: 'DELETE' })
      if (!data.success) {
        notifyError(data.error || 'Không xóa được hàng hóa')
        return
      }
      notifySuccess(data.message || 'Đã xóa hàng hóa')
      setDeleteProduct(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }, [deleteProduct, mutate, notifyError, notifySuccess])

  const productColumns: Column<Product>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Tên mặt hàng',
      cellClassName: 'px-4 py-3 font-medium text-zinc-950 dark:text-white',
      render: (item) => (
        <div className="flex items-center gap-2">
          {item.name}
          {item.type === 'SERVICE'
            ? <Badge variant="blue" size="sm">Dịch vụ</Badge>
            : item.stockQuantity === 0
              ? <Badge variant="danger" size="sm">Hết</Badge>
              : item.stockQuantity <= item.minStockLevel
                ? <Badge variant="warning" size="sm">Sắp hết</Badge>
                : null
          }
        </div>
      ),
    },
    {
      key: 'price',
      label: 'Giá',
      cellClassName: 'px-4 py-3 text-sm tabular-nums text-zinc-950 dark:text-white',
      render: (item) => money(item.price),
    },
    {
      key: 'stockQuantity',
      label: 'Tồn kho',
      cellClassName: 'px-4 py-3 text-sm tabular-nums',
      render: (item) => {
        if (item.type === 'SERVICE') return <span className="text-zinc-400">—</span>
        const out = item.stockQuantity === 0
        const low = item.stockQuantity <= item.minStockLevel
        return (
          <span className={`font-semibold ${
            out ? 'text-red-600 dark:text-red-300' : low ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-950 dark:text-white'
          }`}>
            {item.stockQuantity}
          </span>
        )
      },
    },
    {
      key: 'minStockLevel',
      label: 'Tối thiểu',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (item) => item.type === 'PRODUCT' ? item.minStockLevel : '—',
    },
    {
      label: 'Thao tác',
      cellClassName: 'px-4 py-3',
      render: (item) => (
        item.type === 'PRODUCT' && canManageStock ? (
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" icon={PackagePlus} onClick={() => setMovementProduct(item)}>Nhập / chỉnh</Button>
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteProduct(item)}>Xóa</Button>
          </div>
        ) : null
      ),
    },
  ], [canManageStock])

  // ── Cột cho mobile card list (title + details) ──
  const productCardColumns: CardColumn<Product>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Tên mặt hàng',
      render: (item) => (
        <span className="flex items-center gap-2 text-base font-semibold text-zinc-950 dark:text-white">
          {item.name}
          {item.type === 'SERVICE'
            ? <Badge variant="blue" size="sm">Dịch vụ</Badge>
            : item.stockQuantity === 0
              ? <Badge variant="danger" size="sm">Hết</Badge>
              : item.stockQuantity <= item.minStockLevel
                ? <Badge variant="warning" size="sm">Sắp hết</Badge>
                : null
          }
        </span>
      ),
    },
    {
      key: 'price',
      label: 'Giá',
      render: (item) => <span className="font-medium tabular-nums text-zinc-950 dark:text-white">{money(item.price)}</span>,
    },
    {
      key: 'stockQuantity',
      label: 'Tồn kho',
      render: (item) => {
        if (item.type === 'SERVICE') return <span className="text-zinc-400">—</span>
        const out = item.stockQuantity === 0
        const low = item.stockQuantity <= item.minStockLevel
        return (
          <span className={`font-semibold tabular-nums ${
            out ? 'text-red-600 dark:text-red-300' : low ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-950 dark:text-white'
          }`}>
            {item.stockQuantity}
          </span>
        )
      },
    },
    {
      key: 'minStockLevel',
      label: 'Tối thiểu',
      render: (item) => item.type === 'PRODUCT' ? item.minStockLevel : '—',
    },
    {
      label: '',
      render: (item) => (
        item.type === 'PRODUCT' && canManageStock ? (
          <div className="flex gap-1">
          <Button variant="secondary" size="sm" icon={PackagePlus} onClick={() => setMovementProduct(item)}>Nhập / chỉnh</Button>
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteProduct(item)}>Xóa</Button>
          </div>
        ) : null
      ),
    },
  ], [canManageStock])

  if (loading) {
    return <InventorySkeleton />
  }

  const listHeader = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
            Danh sách kho
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {filteredProducts.length} mục · {stats.stockUnits} đơn vị tồn
          </p>
        </div>
        <Badge variant={stats.lowStock > 0 ? 'warning' : 'success'}>
          {stats.lowStock > 0 ? `${stats.lowStock} sắp hết` : 'Ổn định'}
        </Badge>
      </div>
      <div role="group" aria-label="Lọc kho" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        <FilterButton active={filter === 'ALL'} onClick={() => setFilter('ALL')}>Tất cả</FilterButton>
        <FilterButton active={filter === 'LOW_STOCK'} onClick={() => setFilter('LOW_STOCK')}>Sắp hết</FilterButton>
        <FilterButton active={filter === 'PRODUCT'} onClick={() => setFilter('PRODUCT')}>Hàng hóa</FilterButton>
        <FilterButton active={filter === 'SERVICE'} onClick={() => setFilter('SERVICE')}>Dịch vụ</FilterButton>
      </div>
    </div>
  )

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
              Hàng hóa & dịch vụ
            </h1>
          </div>
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        {!canManageStock && (
          <NoticeCard
            tone="info"
            title="Chế độ nhân viên"
            description="Bạn xem tồn kho để bán kèm khi checkout. Thêm hàng và chỉnh tồn do quản trị viên thực hiện."
          />
        )}

        <section className="grid grid-cols-4 gap-2">
          <InventoryStat
            label="Đang bán"
            value={stats.total}
            active={filter === 'ALL'}
            onClick={() => setFilter('ALL')}
          />
          <InventoryStat
            label="Sắp hết"
            value={stats.lowStock}
            active={filter === 'LOW_STOCK'}
            warning={stats.lowStock > 0}
            onClick={() => setFilter('LOW_STOCK')}
          />
          <InventoryStat
            label="Hàng"
            value={stats.productCount}
            active={filter === 'PRODUCT'}
            onClick={() => setFilter('PRODUCT')}
          />
          <InventoryStat
            label="Dịch vụ"
            value={stats.serviceCount}
            active={filter === 'SERVICE'}
            onClick={() => setFilter('SERVICE')}
          />
        </section>

        {canManageStock && (
          <Button
            variant="inverse"
            size="lg"
            fullWidth
            icon={PackagePlus}
            onClick={() => setCreateOpen(true)}
          >
            Thêm hàng hoặc dịch vụ
          </Button>
        )}

        {/* Mobile: card list */}
        <div className="md:hidden">
          <SortableCardList
            header={listHeader}
            columns={productCardColumns}
            data={filteredProducts}
            keyExtractor={(p) => p.id}
            search={{
              placeholder: 'Tìm tên hoặc SKU',
              getText: (p) => `${p.name} ${p.sku ?? ''}`,
            }}
            sortableKeys={['name', 'price', 'stockQuantity', 'minStockLevel']}
            defaultSortKey="name"
            emptyIcon={Package}
            emptyMessage="Không có hàng hóa"
            emptyDescription="Thử đổi bộ lọc hoặc thêm hàng hóa mới."
          />
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block">
          <SortableTable
            header={listHeader}
            columns={productColumns}
            data={filteredProducts}
            keyExtractor={(p) => p.id}
            search={{
              placeholder: 'Tìm tên hoặc SKU',
              getText: (p) => `${p.name} ${p.sku ?? ''}`,
            }}
            sortableKeys={['name', 'price', 'stockQuantity', 'minStockLevel']}
            defaultSortKey="name"
            emptyIcon={Package}
            emptyMessage="Không có hàng hóa"
            emptyDescription="Thử đổi bộ lọc hoặc thêm hàng hóa mới."
          />
        </div>
      </div>

      <CreateProductDialog
        open={createOpen}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setCreateOpen(false)}
        onDone={() => refreshAfterChange('Đã thêm hàng hóa')}
      />

      <StockMovementDialog
        product={movementProduct}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setMovementProduct(null)}
        onDone={() => refreshAfterChange('Đã cập nhật tồn kho')}
      />

      <DeleteProductConfirmDialog
        product={deleteProduct}
        submitting={submitting}
        onClose={() => setDeleteProduct(null)}
        onDone={handleDelete}
      />
    </div>
  )
}

function InventorySkeleton() {
  return (
    <SkeletonPage>
      <Skeleton className="h-10 w-40" />
      <SkeletonStats />
      <SkeletonPanel><Skeleton className="h-24 w-full" /></SkeletonPanel>
      <SkeletonPanel><Skeleton className="h-80 w-full" /></SkeletonPanel>
    </SkeletonPage>
  )
}

function InventoryStat({
  label,
  value,
  active,
  warning,
  onClick,
}: {
  label: string
  value: number
  active: boolean
  warning?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left shadow-sm transition-colors ${
        active
          ? 'border-blue-300 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10'
          : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800'
      }`}
    >
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${
        warning ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-950 dark:text-white'
      }`}
      >
        {value}
      </p>
    </button>
  )
}

function CreateProductDialog({
  open,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  open: boolean
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { error: notifyError } = useToast()
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [type, setType] = useState<ProductType>('PRODUCT')
  const [price, setPrice] = useState('')
  const [stockQuantity, setStockQuantity] = useState('0')
  const [minStockLevel, setMinStockLevel] = useState('0')

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setName('')
    setSku('')
    setType('PRODUCT')
    setPrice('')
    setStockQuantity('0')
    setMinStockLevel('0')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open])

  const submit = async () => {
    const payload = buildCreateProductPayload({
      name,
      sku,
      type,
      price,
      stockQuantity,
      minStockLevel,
    })

    if ('error' in payload) {
      notifyError(payload.error)
      return
    }

    setSubmitting(true)
    try {
      const data = await apiJson<Product>('/api/products', jsonRequest(payload.data))
      if (!data.success) {
        notifyError(data.error || 'Không thêm được hàng hóa')
        return
      }
      await onDone()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thêm hàng hoặc dịch vụ"
      description="Hàng hóa có tồn kho, dịch vụ chỉ dùng để bán kèm khi checkout"
      footer={
        <Button
          variant="inverse"
          size="lg"
          fullWidth
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? 'Đang lưu...' : 'Lưu vào kho'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="product-name" required>Tên</Label>
          <Input
            id="product-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ví dụ: Nước suối"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="product-type">Loại</Label>
            <Select
              id="product-type"
              value={type}
              onChange={(event) => setType(event.target.value as ProductType)}
            >
              <option value="PRODUCT">Hàng hóa</option>
              <option value="SERVICE">Dịch vụ</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="product-sku">SKU</Label>
            <Input
              id="product-sku"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              placeholder="Tùy chọn"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="product-price" required>Giá bán</Label>
          <Input
            id="product-price"
            type="number"
            min="0"
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>

        {type === 'PRODUCT' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="product-stock">Tồn đầu</Label>
              <Input
                id="product-stock"
                type="number"
                min="0"
                inputMode="numeric"
                value={stockQuantity}
                onChange={(event) => setStockQuantity(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="product-min-stock">Tồn tối thiểu</Label>
              <Input
                id="product-min-stock"
                type="number"
                min="0"
                inputMode="numeric"
                value={minStockLevel}
                onChange={(event) => setMinStockLevel(event.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function StockMovementDialog({
  product,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  product: Product | null
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { error: notifyError } = useToast()
  const [movementType, setMovementType] = useState<StockMovementType>('RESTOCK')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!product) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setMovementType('RESTOCK')
    setQuantity('1')
    setReason('')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [product])

  const parsedQuantity = Number(quantity)
  const nextStock = product && Number.isFinite(parsedQuantity)
    ? product.stockQuantity + parsedQuantity
    : product?.stockQuantity ?? 0

  const submit = async () => {
    if (!product) return

    const parsed = Number(quantity)
    if (!Number.isInteger(parsed) || parsed === 0) {
      notifyError('Số lượng phải là số nguyên khác 0')
      return
    }
    if (movementType === 'RESTOCK' && parsed <= 0) {
      notifyError('Nhập kho phải lớn hơn 0')
      return
    }
    if (product.stockQuantity + parsed < 0) {
      notifyError('Tồn kho không được âm')
      return
    }

    setSubmitting(true)
    try {
      const data = await apiJson(`/api/products/${product.id}/stock`, jsonRequest({
        type: movementType,
        quantity: parsed,
        reason: reason.trim() || undefined,
      }))
      if (!data.success) {
        notifyError(data.error || 'Không cập nhật được tồn kho')
        return
      }
      await onDone()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title={product ? `Nhập / chỉnh - ${product.name}` : 'Nhập / chỉnh kho'}
      description="Nhập kho dùng số dương, điều chỉnh có thể tăng hoặc giảm tồn"
      footer={
        <Button
          variant="inverse"
          size="lg"
          fullWidth
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? 'Đang cập nhật...' : 'Cập nhật tồn kho'}
        </Button>
      }
    >
      {product && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Tồn hiện tại</span>
              <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">
                {product.stockQuantity}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Sau cập nhật</span>
              <span className={`font-semibold tabular-nums ${
                nextStock < 0 ? 'text-red-600 dark:text-red-300' : 'text-zinc-950 dark:text-white'
              }`}
              >
                {Number.isFinite(nextStock) ? nextStock : product.stockQuantity}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="stock-movement-type">Loại</Label>
              <Select
                id="stock-movement-type"
                value={movementType}
                onChange={(event) => {
                  const value = event.target.value as StockMovementType
                  setMovementType(value)
                  if (value === 'RESTOCK' && Number(quantity) <= 0) setQuantity('1')
                }}
              >
                <option value="RESTOCK">Nhập kho</option>
                <option value="ADJUSTMENT">Điều chỉnh</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="stock-movement-quantity" required>Số lượng</Label>
              <Input
                id="stock-movement-quantity"
                type="number"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="stock-reason">Lý do</Label>
            <Textarea
              id="stock-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ví dụ: nhập thêm nước, kiểm kho cuối ngày"
            />
          </div>
        </div>
      )}
    </Modal>
  )
}

function DeleteProductConfirmDialog({
  product,
  submitting,
  onClose,
  onDone,
}: {
  product: Product | null
  submitting: boolean
  onClose: () => void
  onDone: () => void
}) {
  const actionLabel = product?.isActive ? 'Ngưng bán' : 'Xoá'
  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title="Xác nhận xóa hàng"
      description={product ? `Bạn có chắc muốn xóa "${product.name}" khỏi kho?` : ''}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" disabled={submitting} onClick={onClose}>Hủy</Button>
          <Button variant="danger" loading={submitting} onClick={onDone}>{actionLabel}</Button>
        </div>
      }
    >
      {product && (
        <NoticeCard
          tone={product.isActive ? 'warning' : 'info'}
          title={product.isActive ? 'Ngưng bán' : 'Xoá cứng'}
          description={product.isActive
            ? 'Hàng đã có giao dịch sẽ được đưa sang trạng thái ngưng bán, giữ lại lịch sử bán hàng.'
            : 'Hàng chưa có giao dịch sẽ được xoá hoàn toàn.'
          }
        />
      )}
    </Modal>
  )
}

function isLowStock(product: Product): boolean {
  return product.type === 'PRODUCT'
    && product.stockQuantity <= Math.max(1, product.minStockLevel)
}

function buildCreateProductPayload(input: {
  name: string
  sku: string
  type: ProductType
  price: string
  stockQuantity: string
  minStockLevel: string
}): { data: unknown } | { error: string } {
  if (!input.name.trim()) return { error: 'Nhập tên hàng hóa' }

  const price = Number(input.price)
  if (!Number.isFinite(price) || price < 0) return { error: 'Giá bán không hợp lệ' }

  const stockQuantity = input.type === 'PRODUCT' ? Number(input.stockQuantity) : 0
  const minStockLevel = input.type === 'PRODUCT' ? Number(input.minStockLevel) : 0

  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    return { error: 'Tồn đầu phải là số nguyên không âm' }
  }
  if (!Number.isInteger(minStockLevel) || minStockLevel < 0) {
    return { error: 'Tồn tối thiểu phải là số nguyên không âm' }
  }

  return {
    data: {
      name: input.name.trim(),
      sku: input.sku.trim() || undefined,
      type: input.type,
      price,
      stockQuantity,
      minStockLevel,
      isActive: true,
    },
  }
}
