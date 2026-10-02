"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Edit3,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterButton } from "@/components/ui/filter-button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { NoticeCard } from "@/components/ui/notice-card";
import { AppSkeleton } from "@/components/ui/skeleton";
import { SortableTable, type Column } from "@/components/ui/sortable-table";
import {
  SortableCardList,
  type Column as CardColumn,
} from "@/components/ui/sortable-card-list";
import { useToast } from "@/components/ui/toast";
import { isAdminOnly } from "@/lib/shared/roles";
import { useApi } from "@/hooks/use-api";
import { apiJson, jsonRequest } from "@/lib/api";
import {
  cashInputToNumber,
  formatCashInput,
  getCashInputSuggestions,
  normalizeCashInput,
} from "@/lib/shared/cash-input";
import { usePageRefresh } from "@/components/layout/page-refresh-context";
import { formatDay, formatClock, money } from "@/features/pos/format";
import type { UserSession } from "@/features/pos/types";
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'

// ── Types ──

type TypeFilter = "ALL" | "INCOME" | "EXPENSE";

interface CashflowRow {
  id: string;
  type: "INCOME" | "EXPENSE";
  personName: string;
  amount: number;
  reason: string;
  staff: { id: string; fullName: string } | null;
  createdAt: string;
}

interface CashflowSummary {
  income: number;
  expense: number;
  balance: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ── Screen ──

export function CashflowScreen() {
  const { success: notifySuccess, error: notifyError } = useToast();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CashflowRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CashflowRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    params.set("page", String(page));
    return `/api/cashflows?${params}`;
  }, [typeFilter, page]);

  const {
    data: apiData,
    isLoading,
    mutate,
  } = useApi<{
    entries: CashflowRow[];
    summary: CashflowSummary;
    pagination: Pagination;
  }>(url, { dedupingInterval: 30_000 });
  const { data: userData, isLoading: userLoading } = useApi<UserSession>(
    "/api/auth/me",
    { dedupingInterval: 600_000 },
  );

  const { registerRefresh } = usePageRefresh();

  useEffect(() => {
    return registerRefresh(() => void mutate());
  }, [registerRefresh, mutate]);

  const entries = apiData?.data?.entries ?? [];
  const summary = apiData?.data?.summary ?? {
    income: 0,
    expense: 0,
    balance: 0,
  };
  const pagination = apiData?.data?.pagination ?? {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  };
  const error = !apiData?.success ? ((apiData?.error as string) ?? "") : "";
  const loading = isLoading || userLoading;
  const user = userData?.data ?? null;

  const isAdmin = isAdminOnly(user?.role);

  const goPage = (p: number) => {
    if (p < 1 || p > pagination.totalPages) return;
    setPage(p);
  };

  const filterByType = (f: TypeFilter) => {
    setTypeFilter(f);
  };

  // ── Table columns ──
  const columns: Column<CashflowRow>[] = useMemo(
    () => [
      {
        key: "createdAt",
        label: "Ngày giờ",
        headerClassName: "w-[140px] pl-4 pr-3",
        cellClassName:
          "whitespace-nowrap py-3 pl-4 pr-3 text-xs text-zinc-500 dark:text-zinc-400",
        render: (e) => (
          <>
            <span className="tabular-nums">{formatDay(e.createdAt)}</span>{" "}
            <span className="tabular-nums">{formatClock(e.createdAt)}</span>
          </>
        ),
      },
      {
        key: "type",
        label: "Thu/Chi",
        headerClassName: "w-[72px] px-3",
        cellClassName: "py-3 pl-3 pr-3",
        render: (e) => (
          <Badge variant={e.type === "INCOME" ? "success" : "danger"} size="sm">
            {e.type === "INCOME" ? "Thu" : "Chi"}
          </Badge>
        ),
      },
      {
        key: "personName",
        label: "Người phát sinh",
        headerClassName: "w-[160px] px-3",
        cellClassName: "py-3 pl-3 pr-3",
        render: (e) => (
          <span className="font-medium text-zinc-950 dark:text-white">
            {e.personName}
          </span>
        ),
      },
      {
        key: "amount",
        label: "Số tiền",
        headerClassName: "w-[160px] px-3",
        cellClassName: "py-3 pl-3 pr-3",
        render: (e) => (
          <span
            className={`text-sm font-bold tabular-nums ${
              e.type === "INCOME"
              ? "text-success"
              : "text-danger"
            }`}
          >
            {e.type === "INCOME" ? "+" : "-"}
            {money(e.amount, false)}
          </span>
        ),
      },
      {
        key: "reason",
        label: "Lý do",
        cellClassName:
          "py-3 pl-3 pr-3 text-sm text-zinc-500 dark:text-zinc-400",
        render: (e) => <span className="line-clamp-2">{e.reason}</span>,
      },
      {
        label: "Hành động",
        headerClassName: "w-[72px] pr-4 text-right",
        cellClassName: "whitespace-nowrap py-3 pl-3 pr-4 text-right",
        render: (e) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={Edit3}
              onClick={() => setEditingEntry(e)}
              title="Sửa"
            />
            <Button
              variant="red-soft"
              size="sm"
              icon={Trash2}
              onClick={() => setDeleteTarget(e)}
              title="Xoá"
            />
          </div>
        ),
      },
    ],
    [],
  );

  // ── Cột cho mobile card list (title + details + actions) ──
  const cardColumns: CardColumn<CashflowRow>[] = useMemo(
    () => [
      {
        key: "personName",
        label: "Người phát sinh",
        render: (e) => (
          <span className="flex flex-wrap items-center gap-2 text-base font-semibold text-zinc-950 dark:text-white">
            {e.personName}
            <Badge
              variant={e.type === "INCOME" ? "success" : "danger"}
              size="sm"
            >
              {e.type === "INCOME" ? "Thu" : "Chi"}
            </Badge>
          </span>
        ),
      },
      {
        key: "amount",
        label: "Số tiền",
        render: (e) => (
          <span
            className={`text-sm font-bold tabular-nums ${
              e.type === "INCOME"
              ? "text-success"
              : "text-danger"
            }`}
          >
            {e.type === "INCOME" ? "+" : "-"}
            {money(e.amount, false)}
          </span>
        ),
      },
      {
        key: "createdAt",
        label: "Ngày giờ",
        render: (e) => (
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
            {formatDay(e.createdAt)} {formatClock(e.createdAt)}
          </span>
        ),
      },
      {
        key: "reason",
        label: "Lý do",
        render: (e) => <span className="line-clamp-2">{e.reason}</span>,
      },
      {
        label: "",
        render: (e) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={Edit3}
              onClick={() => setEditingEntry(e)}
              title="Sửa"
            />
            <Button
              variant="red-soft"
              size="sm"
              icon={Trash2}
              onClick={() => setDeleteTarget(e)}
              title="Xoá"
            />
          </div>
        ),
      },
    ],
    [],
  );

  // ── Mutations ──

  const handleCreate = async (payload: {
    type: "INCOME" | "EXPENSE";
    personName: string;
    amount: number;
    reason: string;
  }) => {
    setSubmitting(true);
    try {
      const data = await apiJson<{ id: string }>(
        "/api/cashflows",
        jsonRequest(payload),
      );
      if (!data.success) {
        notifyError(data.error || "Không thêm được");
        return false;
      }
      notifySuccess("Đã thêm khoản thu chi");
      setDialogOpen(false);
      await mutate();
      return true;
    } catch {
      notifyError("Lỗi kết nối máy chủ");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (payload: {
    type: "INCOME" | "EXPENSE";
    personName: string;
    amount: number;
    reason: string;
  }) => {
    if (!editingEntry) return false;
    setSubmitting(true);
    try {
      const data = await apiJson(`/api/cashflows/${editingEntry.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!data.success) {
        notifyError(data.error || "Không sửa được");
        return false;
      }
      notifySuccess("Đã cập nhật khoản thu chi");
      setEditingEntry(null);
      await mutate();
      return true;
    } catch {
      notifyError("Lỗi kết nối máy chủ");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const data = await apiJson(`/api/cashflows/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!data.success) {
        notifyError(data.error || "Không xoá được");
        return;
      }
      notifySuccess("Đã xoá khoản thu chi");
      setDeleteTarget(null);
      await mutate();
    } catch {
      notifyError("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <AppSkeleton />;

  const listHeader = (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
          Danh sách thu chi
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {pagination.total} khoản thu chi
        </p>
      </div>
      <div
        role="group"
        aria-label="Lọc thu chi"
        className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
      >
        <FilterButton
          active={typeFilter === "ALL"}
          onClick={() => filterByType("ALL")}
        >
          Tất cả
        </FilterButton>
        <FilterButton
          active={typeFilter === "INCOME"}
          onClick={() => filterByType("INCOME")}
        >
          Thu
        </FilterButton>
        <FilterButton
          active={typeFilter === "EXPENSE"}
          onClick={() => filterByType("EXPENSE")}
        >
          Chi
        </FilterButton>
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        {/* Header */}
        <header className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className={PAGE_TITLE_CLASS}>
              Thu chi
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

        {!isAdmin ? (
          <AccessDenied />
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatCard
                label="Tổng thu"
                amount={summary.income}
                icon={TrendingUp}
                tone="income"
              />
              <StatCard
                label="Tổng chi"
                amount={summary.expense}
                icon={TrendingDown}
                tone="expense"
              />
              <StatCard
                label="Số dư"
                amount={summary.balance}
                icon={Wallet}
                tone={summary.balance >= 0 ? "balance" : "danger"}
              />
            </div>

            {/* <div className="flex justify-end"> */}
            <Button
              variant="contrast"
              size="lg"
              fullWidth
              icon={Plus}
              onClick={() => setDialogOpen(true)}
            >
              Thêm khoản thu chi
            </Button>
            {/* </div> */}

            {/* Mobile: card list */}
            <div className="md:hidden">
              <SortableCardList
                header={listHeader}
                columns={cardColumns}
                data={entries}
                keyExtractor={(e) => e.id}
                sortableKeys={["personName", "amount", "createdAt", "reason"]}
                defaultSortKey="createdAt"
                emptyIcon={ArrowRightLeft}
                emptyMessage="Chưa có khoản thu chi nào"
                emptyDescription='Nhấn "Thêm khoản thu chi" để ghi nhận khoản thu hoặc chi.'
              />
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <SortableTable
                header={listHeader}
                columns={columns}
                data={entries}
                keyExtractor={(e) => e.id}
                sortableKeys={[
                  "createdAt",
                  "type",
                  "personName",
                  "amount",
                  "reason",
                ]}
                defaultSortKey="createdAt"
                emptyIcon={ArrowRightLeft}
                emptyMessage="Chưa có khoản thu chi nào"
                emptyDescription='Nhấn "Thêm khoản thu chi" để ghi nhận khoản thu hoặc chi.'
                pagination={{
                  page: pagination.page,
                  totalPages: pagination.totalPages,
                  total: pagination.total,
                  onPageChange: goPage,
                }}
              />
            </div>
          </>
        )}

        {/* Create dialog */}
        {dialogOpen && (
          <CashflowFormDialog
            adminName={user?.fullName ?? ""}
            submitting={submitting}
            onSubmit={handleCreate}
            onClose={() => setDialogOpen(false)}
          />
        )}

        {/* Edit dialog */}
        {editingEntry && (
          <CashflowFormDialog
            adminName={user?.fullName ?? ""}
            initial={editingEntry}
            submitting={submitting}
            onSubmit={handleEdit}
            onClose={() => setEditingEntry(null)}
          />
        )}

        {/* Delete confirm */}
        {deleteTarget && (
          <ConfirmDialog
            open
            onClose={() => setDeleteTarget(null)}
            title="Xoá khoản thu chi"
            description={
              deleteTarget.type === "INCOME"
                ? `Xoá khoản thu ${money(deleteTarget.amount, false)} từ ${deleteTarget.personName}?`
                : `Xoá khoản chi ${money(deleteTarget.amount, false)} cho ${deleteTarget.personName}?`
            }
            confirmLabel="Xoá"
            submitting={submitting}
            onConfirm={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function AccessDenied() {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
        Chỉ quản trị viên được truy cập
      </h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Quản lý thu chi chỉ dành cho tài khoản Admin.
      </p>
    </section>
  );
}

function StatCard({
  label,
  amount,
  icon: Icon,
  tone,
}: {
  label: string;
  amount: number;
  icon: LucideIcon;
  tone: "income" | "expense" | "balance" | "danger";
}) {
  const colorMap = {
    income:
      "text-success bg-success-bg text-success bg-success-bg",
    expense: "text-danger bg-danger-bg text-danger bg-danger-bg",
    balance: "text-info bg-info-bg text-info bg-info-bg",
    danger: "text-danger bg-danger-bg text-danger bg-danger-bg",
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colorMap[tone]}`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
        <p
          className={`mt-1 text-lg font-bold tabular-nums ${
            tone === "danger"
            ? "text-danger"
              : "text-zinc-950 dark:text-white"
          }`}
        >
          {money(amount, false)}
        </p>
      </div>
    </div>
  );
}

/**
 * Dùng chung cho cả tạo mới và sửa.
 * Nếu có `initial` → mode edit, pre-fill form từ entry hiện tại.
 */
function CashflowFormDialog({
  adminName,
  initial,
  submitting,
  onSubmit,
  onClose,
}: {
  adminName: string;
  initial?: CashflowRow;
  submitting: boolean;
  onSubmit: (payload: {
    type: "INCOME" | "EXPENSE";
    personName: string;
    amount: number;
    reason: string;
  }) => Promise<boolean>;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [type, setType] = useState<"INCOME" | "EXPENSE">(
    initial?.type ?? "INCOME",
  );
  const [amount, setAmount] = useState(
    initial ? formatCashInput(initial.amount) : "",
  );
  const [reason, setReason] = useState(initial?.reason ?? "");
  const amountRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    cashInputToNumber(amount) > 0 && reason.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const ok = await onSubmit({
      type,
      personName: adminName,
      amount: cashInputToNumber(amount),
      reason: reason.trim(),
    });
    if (ok) {
      setType("INCOME");
      setAmount("");
      setReason("");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isEdit ? "Sửa khoản thu chi" : "Thêm khoản thu chi"}
      description={`Người tạo: ${adminName}`}
    >
      <div className="space-y-4">
        {/* Type toggle */}
        <div>
          <Label required>Loại</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType("INCOME")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                type === "INCOME"
                ? "border-success bg-success-bg text-success border-success-border bg-success-bg text-success"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              <TrendingUp size={16} />
              Thu
            </button>
            <button
              type="button"
              onClick={() => setType("EXPENSE")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                type === "EXPENSE"
                ? "border-danger-border bg-danger-bg text-danger"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              <TrendingDown size={16} />
              Chi
            </button>
          </div>
        </div>

        {/* Amount */}
        <div>
          <Label htmlFor="cf-amount" required>
            Số tiền
          </Label>
          <Input
            id="cf-amount"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={amount}
            onChange={(e) => {
              const next = normalizeCashInput(
                e.target.value,
                e.target.selectionStart ?? e.target.value.length,
              );
              setAmount(next.value);
              requestAnimationFrame(() =>
                amountRef.current?.setSelectionRange(next.caret, next.caret),
              );
            }}
            placeholder="0"
            className="mt-1.5"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {getCashInputSuggestions(amount).map((suggestion) => (
              <button
                key={suggestion.value}
                type="button"
                onClick={() => setAmount(formatCashInput(suggestion.value))}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
          {amount && cashInputToNumber(amount) > 0 && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {formatCashInput(cashInputToNumber(amount))}
            </p>
          )}
        </div>

        {/* Reason */}
        <div>
          <Label htmlFor="cf-reason" required>
            Lý do
          </Label>
          <Textarea
            id="cf-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Tiền điện tháng 8"
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="mt-6">
        <Button
          variant="contrast"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting
            ? "Đang lưu..."
            : isEdit
              ? "Cập nhật"
              : "Thêm khoản thu chi"}
        </Button>
      </div>
    </Modal>
  );
}
