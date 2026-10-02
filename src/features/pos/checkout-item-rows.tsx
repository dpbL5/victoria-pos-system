"use client";

/**
 * ── Dòng hàng của phiếu thu ───────────────────────────────────────────────
 * Mọi mặt hàng của phiếu là MỘT kiểu dòng: dù đã bán kèm lúc chơi hay vừa
 * thêm lúc thu, nó đều là dòng bán kèm của phiên, đều sửa được tại chỗ, đều
 * đi qua cùng một nút Thêm. Trước đây có hai khối — dòng đã gán chỉ-để-đọc
 * (chạm vào là XOÁ khỏi phiên) và dòng chọn lúc thu — nên cùng một câu hỏi
 * "khách vừa gọi thêm gì" phải đọc hai nơi.
 *
 * Bố cục dòng: tên + tiền trên một dòng, phép nhân + bước −/+ trên dòng dưới.
 * Không gộp làm một dòng vì ở 390px tên sẽ bị bóp; dòng dưới giữ đúng khuôn
 * `AdjustRow` của phí gửi xe, và rail tiền vẫn thẳng cột bên phải như mọi
 * dòng khác trên phiếu.
 *
 * Meta là phép nhân chứ không phải chú thích: `3 × 15.000đ` để nhân viên tự
 * kiểm bằng mắt, và đơn giá lấy từ dòng bán kèm (giá chốt lúc thêm) chứ không
 * lấy từ danh sách sản phẩm — nếu không dòng sẽ không cộng khớp với hoá đơn.
 */

import { Minus, Plus } from "lucide-react";
import { GROUP_LABEL, MONEY_RAIL } from "./checkout-player-picker";
import { money } from "./format";
import type { PendingSellItem } from "@/types";

/** Nút −/+ dùng chung cho mọi bước tăng giảm trên phiếu (dòng hàng, phí gửi xe) */
export const stepperButton =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-border-default bg-surface-elevated text-text-secondary transition-colors active:scale-95 disabled:opacity-40 disabled:active:scale-100";

export function CheckoutItemRow({
  item,
  atMax,
  onChangeQuantity,
}: {
  item: PendingSellItem;
  /** Đã chạm trần tồn kho — nút + chết, phải nói lý do chứ không để chết lặng */
  atMax: boolean;
  onChangeQuantity: (quantity: number) => void;
}) {
  return (
    <li className="border-b border-border-default py-2.5 last:border-b-0">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm leading-tight text-text-primary">
          {item.productName}
        </span>
        <span className={`${MONEY_RAIL} text-sm font-medium text-text-primary`}>
          {money(item.subtotal, false)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs tabular-nums text-text-tertiary">
          {item.quantity} × {money(item.unitPrice, false)}
          {atMax ? (
            <span className="text-danger"> · Hết tồn</span>
          ) : item.type === "SERVICE" ? (
            " · dịch vụ"
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={`Bớt ${item.productName}`}
            onClick={() => onChangeQuantity(item.quantity - 1)}
            className={stepperButton}
          >
            <Minus size={14} aria-hidden />
          </button>
          <span className="w-5 text-center text-sm font-semibold tabular-nums text-text-primary">
            {item.quantity}
          </span>
          <button
            type="button"
            aria-label={`Thêm ${item.productName}`}
            onClick={() => onChangeQuantity(item.quantity + 1)}
            disabled={atMax}
            className={stepperButton}
          >
            <Plus size={14} aria-hidden />
          </button>
        </span>
      </div>
    </li>
  );
}

/** Khối hàng hoá: danh sách dòng + nút Thêm duy nhất. Rỗng thì chỉ có nút Thêm. */
export function CheckoutItemLedger({
  items,
  isAtMax,
  onAddClick,
  onChangeQuantity,
}: {
  items: PendingSellItem[];
  isAtMax: (item: PendingSellItem) => boolean;
  onAddClick: () => void;
  onChangeQuantity: (item: PendingSellItem, quantity: number) => void;
}) {
  return (
    <div className="mt-4">
      <h4 className={GROUP_LABEL}>Hàng hoá &amp; dịch vụ</h4>
      {items.length > 0 ? (
        <ul className="mt-1.5 border-t border-border-default">
          {items.map((item) => (
            <CheckoutItemRow
              key={item.sessionSellItemId}
              item={item}
              atMax={isAtMax(item)}
              onChangeQuantity={(quantity) => onChangeQuantity(item, quantity)}
            />
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={onAddClick}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-3 text-sm font-medium text-text-secondary transition-colors active:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Plus size={16} aria-hidden />
        Thêm hàng hoá / dịch vụ
      </button>
    </div>
  );
}
