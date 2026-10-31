"use client";

import { useEffect, useState } from "react";
import { Check, Minus, Plus, User, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { apiJson, jsonRequest } from "@/lib/api";
import { money, toNumber } from "./format";
import { CustomerSearch } from "./customer-search";
import { PaymentMethodPicker } from "./payment-method-picker";
import type { Customer, PaymentMethod, Product } from "./types";

export function RetailDialog({
  open,
  products,
  productsLoading,
  productsError,
  onRetryProducts,
  shiftReady,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  open: boolean;
  products: Product[];
  productsLoading: boolean;
  productsError: string;
  onRetryProducts: () => void;
  shiftReady: boolean;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onClose: () => void;
  onDone: () => Promise<boolean | void>;
}) {
  const { success: notifySuccess, error: notifyError } = useToast();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [tab, setTab] = useState<"CUSTOMER" | "STAFF">("CUSTOMER");
  const [staffProductId, setStaffProductId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setCart({});
      setPaymentMethod("CASH");
      setCustomer(null);
      setCustomerQuery("");
      setTab("CUSTOMER");
      setStaffProductId(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open]);

  const cartLines = products
    .map((product) => ({
      product,
      quantity: cart[product.id] ?? 0,
      total: (cart[product.id] ?? 0) * toNumber(product.price),
    }))
    .filter((line) => line.quantity > 0);

  const grandTotal = cartLines.reduce((sum, line) => sum + line.total, 0);

  const changeCart = (product: Product, delta: number) => {
    setCart((current) => {
      const currentQuantity = current[product.id] ?? 0;
      const nextQuantity = currentQuantity + delta;
      if (nextQuantity <= 0) {
        const next = { ...current };
        delete next[product.id];
        return next;
      }
      if (product.type === "PRODUCT" && nextQuantity > product.stockQuantity)
        return current;
      return { ...current, [product.id]: nextQuantity };
    });
  };

  const handleSell = async () => {
    if (!shiftReady) {
      notifyError("Cần mở ca trước khi bán lẻ");
      return;
    }
    if (cartLines.length === 0) {
      notifyError("Chưa chọn sản phẩm hoặc dịch vụ");
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiJson(
        "/api/retail-sales",
        jsonRequest({
          items: cartLines.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
          })),
          paymentMethod,
          customerId: customer?.id ?? null,
        }),
      );

      if (!data.success) {
        notifyError(data.error || "Không bán được");
        return;
      }

      const refreshed = await onDone();
      notifySuccess(
        refreshed === false
          ? "Đã ghi nhận giao dịch; danh sách hàng chưa cập nhật. Không thu lại, hãy tải lại màn hình."
          : `Đã thu ${money(grandTotal)}`,
      );
    } catch {
      notifyError("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  const goods = products.filter((product) => product.type === "PRODUCT");

  const handleStaffReceive = async () => {
    const selected = goods.find((product) => product.id === staffProductId);
    if (!selected) {
      notifyError("Chọn một món hàng");
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiJson(
        `/api/products/${selected.id}/consume`,
        jsonRequest({}),
      );

      if (!data.success) {
        notifyError(data.error || "Không trừ được kho");
        return;
      }

      const refreshed = await onDone();
      notifySuccess(
        refreshed === false
          ? "Đã trừ kho; danh sách hàng chưa cập nhật. Hãy tải lại màn hình."
          : `Đã trừ 1 ${selected.name}`,
      );
    } catch {
      notifyError("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bán lẻ"
      description=""
      size="lg"
      footer={tab === "CUSTOMER" ? (
        <Button
          variant="contrast"
          size="lg"
          fullWidth
          disabled={
            submitting ||
            productsLoading ||
            !!productsError ||
            !shiftReady ||
            cartLines.length === 0
          }
          onClick={handleSell}
        >
          {submitting ? "Đang xử lý..." : `Thu tiền ${money(grandTotal)}`}
        </Button>
      ) : (
        <Button
          variant="contrast"
          size="lg"
          fullWidth
          disabled={submitting || productsLoading || !!productsError || !staffProductId}
          onClick={handleStaffReceive}
        >
          {submitting ? "Đang xử lý..." : "Nhận"}
        </Button>
      )}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={tab === "CUSTOMER" ? "blue" : "white"}
            size="lg"
            fullWidth
            icon={User}
            aria-pressed={tab === "CUSTOMER"}
            onClick={() => setTab("CUSTOMER")}
          >
            Khách hàng
          </Button>
          <Button
            variant={tab === "STAFF" ? "blue" : "white"}
            size="lg"
            fullWidth
            icon={Users}
            aria-pressed={tab === "STAFF"}
            onClick={() => setTab("STAFF")}
          >
            Nhân viên
          </Button>
        </div>

        {tab === "CUSTOMER" ? (
          <>
        {/* ── Khách hàng (tuỳ chọn) ── */}
        <div>
          <Label>Khách hàng (tuỳ chọn)</Label>
          {customer ? (
            <div className="mt-1 flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                  {customer.fullName}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {customer.type === "MEMBER" ? "Hội viên" : "Vãng lai"}
                  {customer.phone ? ` · ${customer.phone}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomer(null)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Bỏ chọn khách"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <CustomerSearch
              className="mt-1"
              value={customerQuery}
              onValueChange={setCustomerQuery}
              onSelect={setCustomer}
            />
          )}
        </div>

        {/* ── Sản phẩm ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Nước / dịch vụ</Label>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {cartLines.length} món
            </span>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {productsLoading ? (
              <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                Đang tải danh sách sản phẩm...
              </p>
            ) : productsError ? (
              <div
                role="alert"
                className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger"
              >
                <p>Không tải được sản phẩm: {productsError}</p>
                <Button variant="white" size="sm" className="mt-2" onClick={onRetryProducts}>
                  Thử lại
                </Button>
              </div>
            ) : products.length === 0 ? (
              <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                Chưa có sản phẩm hoặc dịch vụ.
              </p>
            ) : (
              products.map((product) => {
                const quantity = cart[product.id] ?? 0;
                const outOfStock =
                  product.type === "PRODUCT" && product.stockQuantity <= 0;
                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                        {product.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {money(product.price)}
                        {product.type === "PRODUCT"
                          ? ` · còn ${product.stockQuantity}`
                          : " · dịch vụ"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeCart(product, -1)}
                        disabled={quantity === 0}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-5 text-center text-sm tabular-nums text-zinc-950 dark:text-white">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeCart(product, 1)}
                        disabled={outOfStock}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Phương thức thanh toán ── */}
        <PaymentMethodPicker
          id="retail-payment"
          label="Phương thức thanh toán"
          amount={grandTotal}
          method={paymentMethod}
          onMethodChange={setPaymentMethod}
        />
          </>
        ) : productsLoading ? (
          <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            Đang tải danh sách hàng hoá...
          </p>
        ) : productsError ? (
          <div
            role="alert"
            className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger"
          >
            <p>Không tải được hàng hoá: {productsError}</p>
            <Button variant="white" size="sm" className="mt-2" onClick={onRetryProducts}>
              Thử lại
            </Button>
          </div>
        ) : goods.length === 0 ? (
          <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            Chưa có hàng hoá.
          </p>
        ) : (
          <div>
            <Label>Hàng hoá</Label>
            <div className="mt-1 max-h-64 space-y-2 overflow-y-auto pr-1">
              {goods.map((product) => {
                const selected = staffProductId === product.id;
                const outOfStock = product.stockQuantity <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={outOfStock}
                    aria-pressed={selected}
                    onClick={() => setStaffProductId(selected ? null : product.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                      selected
                        ? "border-info-border bg-info-bg"
                        : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                        {product.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {outOfStock ? "Hết hàng" : `Còn ${product.stockQuantity}`}
                      </p>
                    </div>
                    {selected && <Check size={16} className="text-info" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
