"use client";

/**
 * ── Tờ chọn hàng ───────────────────────────────────────────────────────────
 * Nút "Thêm hàng hoá / dịch vụ" ở liên 1 mở tờ này. Chạm một món là thêm thẳng
 * 1 vào phiên ngay (dòng bán kèm), nên tờ không có giỏ riêng — giỏ chính là
 * danh sách dòng hàng ở liên 1. Sheet đóng lại thì thấy ngay tổng tiền mới.
 *
 * Không có ô tìm: danh sách sản phẩm ở quầy vẫn ngắn, và nhân viên đã quen
 * bấm theo vị trí ở luồng Bán kèm. Thêm tìm sau nếu danh mục phình to.
 */

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { money } from "./format";
import type { Product } from "./types";

export function ProductPickerSheet({
  open,
  products,
  loading,
  error,
  pickedCount,
  onRetry,
  onPick,
  onClose,
}: {
  open: boolean;
  products: Product[];
  loading: boolean;
  error: string;
  /** Số món đã chọn trong lúc mở tờ này (để chân tờ nói rõ đã chọn gì) */
  pickedCount: number;
  onRetry: () => void;
  onPick: (product: Product) => void;
  onClose: () => void;
}) {
  const available = products.filter(
    (product) => product.type === "SERVICE" || product.stockQuantity > 0,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      size="md"
      title="Thêm hàng hoá / dịch vụ"
      footer={
        <div className="space-y-2">
          {pickedCount > 0 ? (
            <p className="text-center text-xs text-text-tertiary">
              Đã thêm{" "}
              <span className="font-semibold tabular-nums text-text-secondary">
                {pickedCount}
              </span>{" "}
              món vào phiên
            </p>
          ) : null}
          <Button variant="contrast" fullWidth onClick={onClose}>
            Xong
          </Button>
        </div>
      }
    >
      {loading ? (
        <p className="rounded-lg bg-surface-tertiary px-3 py-3 text-sm text-text-secondary">
          Đang tải danh sách sản phẩm...
        </p>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-bg px-3 py-3 text-sm text-danger"
        >
          <p>Không tải được sản phẩm: {error}</p>
          <Button variant="white" size="sm" className="mt-2" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      ) : available.length === 0 ? (
        <p className="rounded-lg bg-surface-tertiary px-3 py-3 text-sm text-text-secondary">
          Chưa có sản phẩm hoặc dịch vụ nào đang bán.
        </p>
      ) : (
        <ul className="space-y-2">
          {available.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onPick(product)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border-default px-3 py-2.5 text-left transition-colors active:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {product.name}
                  </span>
                  <span className="block text-xs text-text-tertiary">
                    {money(product.price)}
                    {product.type === "PRODUCT"
                      ? ` · còn ${product.stockQuantity}`
                      : " · dịch vụ"}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-default bg-surface-elevated text-text-secondary"
                >
                  <Plus size={14} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
