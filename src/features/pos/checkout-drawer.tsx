"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { apiJson, jsonRequest } from "@/lib/api";
import {
  calcElapsedHMS,
  formatPausedHMS,
  money,
  pausedSecondsUntil,
  paymentMethodLabel,
  toNumber,
} from "./format";
import { formatPromotionOption } from "./promotion-option";
import { InvoiceRow } from "./invoice-row";
import {
  CheckoutPlayerPicker,
  type PickerGroup,
} from "./checkout-player-picker";
import type { PlayTimeQuote, PromotionSnapshot } from "@/types";
import type { PaymentMethod, Product, SessionRow } from "./types";

/** Section có thể thu gọn — mặc định đóng, bấm header để mở.
 *  Truyền `collapsible={false}` để luôn hiển thị nội dung (không có nút thu gọn). */
function SectionCard({
  title,
  summary,
  defaultOpen = false,
  collapsible = true,
  className,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const showContent = !collapsible || open;
  const headerContent = (
    <>
      <span className="text-sm font-semibold text-zinc-950 dark:text-white">
        {title}
      </span>
      <span className="flex items-center gap-2">
        {summary ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {summary}
          </span>
        ) : null}
        {collapsible &&
          (open ? (
            <ChevronUp size={16} className="text-zinc-400" />
          ) : (
            <ChevronDown size={16} className="text-zinc-400" />
          ))}
      </span>
    </>
  );
  return (
    <div
      className={`rounded-xl border border-zinc-200 dark:border-zinc-800 ${
        className ?? ""
      }`}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
          {headerContent}
        </div>
      )}
      {showContent && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}

const stepperMinus =
  "flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100 dark:border-zinc-700 dark:text-zinc-300";
const stepperPlus =
  "flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-950 text-white active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100 dark:bg-white dark:text-zinc-950";
const productMinus =
  "flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100 dark:border-zinc-700 dark:text-zinc-300";
const productPlus =
  "flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100 dark:bg-white dark:text-zinc-950";

interface CheckoutResponse {
  grandTotal: number;
}

interface PricingRuleOption {
  id: string;
  name: string;
  ratePerHour: number;
  tiers: { minHours: number; ratePerHour: number }[];
}

export function CheckoutDrawer({
  session,
  frozenAt,
  products,
  shiftReady,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  session: SessionRow | null;
  frozenAt: string | null;
  products: Product[];
  shiftReady: boolean;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { success: notifySuccess, error: notifyError } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [playQuote, setPlayQuote] = useState<PlayTimeQuote | null>(null);
  const [promotions, setPromotions] = useState<PromotionSnapshot[]>([]);
  const [promotionRuleId, setPromotionRuleId] = useState("");
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotionsError, setPromotionsError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [parkingVehicleCount, setParkingVehicleCount] = useState(0);
  // Danh sách DRAFT invoice (lần bán kèm) được chọn thu trong lần checkout này
  const [selectedDraftInvoiceIds, setSelectedDraftInvoiceIds] = useState<string[]>([]);
  const draftSelectionInitialized = useRef(false);
  // Bảng giá hiệu lực — chỉ cần cho session chưa gán giá (fresh walk-in)
  const [applicablePricingRules, setApplicablePricingRules] = useState<
    PricingRuleOption[]
  >([]);
  // Luồng chọn người + bảng giá thống nhất
  const [pickerGroups, setPickerGroups] = useState<PickerGroup[]>([]);
  const nextGroupKey = useRef(0);
  // Legacy: session cũ không có player rows — giữ stepper số người như trước
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [checkoutPlayerCount, setCheckoutPlayerCount] = useState(1);

  const isMember =
    session?.customer?.type === "MEMBER" || !!session?.membership;
  const sessionPlayerCount = session?.playerCount ?? 1;
  const isGroupSession = sessionPlayerCount > 1;

  // Session check-in mới (để trống giá) — cần chọn bảng giá khi thu tiền
  const needsPricing =
    !!session &&
    !isMember &&
    (session.pricingGroups?.length ?? 0) > 0 &&
    session.pricingGroups!.every(
      (g) => !g.pricingSnapshot && Number(g.hourlyRate) === 0,
    );
  // Phiên có player rows (per-player) — dùng picker; không có → legacy stepper
  const sessionHasPlayers =
    (session?.pricingGroups ?? []).some((g) => (g.players?.length ?? 0) > 0);
  // Dùng picker khi vãng lai và có player rows
  const pickerActive = !!session && !isMember && sessionHasPlayers;

  // Tất cả người chưa thu của phiên
  const allUncheckedPlayers = useMemo(
    () =>
      (session?.pricingGroups ?? []).flatMap((g) =>
        (g.players ?? []).filter((p) => !p.checkedOutAt),
      ),
    [session],
  );
  const uncheckedTotal = allUncheckedPlayers.length;
  // Tổng người đang được chọn thu (từ picker)
  const selectedCount = useMemo(
    () =>
      new Set(pickerGroups.flatMap((g) => g.selectedIds)).size,
    [pickerGroups],
  );
  // Đang thu trước = chọn ít hơn tổng người chưa thu
  const isPartialBySelection =
    pickerActive && selectedCount > 0 && selectedCount < uncheckedTotal;

  useEffect(() => {
    if (session) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setPaymentMethod("CASH");
      setCart({});
      setPromotionRuleId("");
      setPromotions([]);
      setPromotionsError("");
      setParkingVehicleCount(0);
      setSelectedDraftInvoiceIds([]);
      draftSelectionInitialized.current = false;
      setApplicablePricingRules([]);
      setPickerGroups([]);
      nextGroupKey.current = 0;
      setSelectedGroupId("");
      setCheckoutPlayerCount(1);

      if (!isMember && !needsPricing && sessionHasPlayers) {
        // ── Phiên đã gán giá (mode B): build nhóm cố định từ pricing groups ──
        // Mỗi nhóm còn người chưa thu = 1 card; mặc định chọn tất cả (thu hết).
        const groups: PickerGroup[] = (session.pricingGroups ?? [])
          .filter((g) => g.remainingCount > 0)
          .map((g) => {
            const unchecked = (g.players ?? []).filter((p) => !p.checkedOutAt);
            const snapshot = g.pricingSnapshot;
            return {
              key: g.id,
              label: g.label,
              locked: true,
              pricingRuleId: g.pricingRuleId ?? "",
              pricingRuleName: snapshot?.name,
              remainingCount: g.remainingCount,
              checkedOutCount: g.playerCount - g.remainingCount,
              members: unchecked.map((p) => ({
                id: p.id,
                name: p.name ?? null,
                disabled: false,
              })),
              selectedIds: unchecked.map((p) => p.id),
            };
          });
        setPickerGroups(groups);
      } else if (!isMember && !needsPricing && !sessionHasPlayers) {
        // Legacy: chọn nhóm + stepper số người
        const groups = session.pricingGroups ?? [];
        const firstActive = groups.find((g) => g.remainingCount > 0);
        setSelectedGroupId(firstActive?.id ?? "");
        setCheckoutPlayerCount(
          firstActive?.remainingCount ?? session.playerCount ?? 1,
        );
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [session, isMember, needsPricing, sessionHasPlayers]);

  // Fetch bảng giá hiệu lực khi mở drawer với session cần gán giá (fresh walk-in)
  useEffect(() => {
    if (!session || !needsPricing || !pickerActive) return;
    let cancelled = false;
    const allPlayerIds = (session.pricingGroups ?? []).flatMap((g) =>
      (g.players ?? []).filter((p) => !p.checkedOutAt).map((p) => p.id),
    );
    const loadRules = async () => {
      try {
        const data = await apiJson<PricingRuleOption[]>(
          "/api/pricing/applicable",
        );
        if (data.success && !cancelled) {
          const rules = data.data ?? [];
          setApplicablePricingRules(rules);
          // Mặc định 1 nhóm gồm toàn bộ người chơi chưa thu, bảng giá đầu tiên
          setPickerGroups((current) =>
            current.length > 0
              ? current
              : [
                  {
                    key: `new-${nextGroupKey.current++}`,
                    label: "Nhóm 1",
                    locked: false,
                    pricingRuleId: rules[0]?.id ?? "",
                    members: allPlayerIds.map((id) => ({
                      id,
                      name:
                        (session.pricingGroups ?? [])
                          .flatMap((g) => g.players ?? [])
                          .find((p) => p.id === id)?.name ?? null,
                      disabled: false,
                    })),
                    selectedIds: allPlayerIds,
                  },
                ],
          );
        }
      } catch {
        /* bỏ qua — UI hiển thị trạng thái chưa có bảng giá */
      }
    };
    void loadRules();
    return () => {
      cancelled = true;
    };
  }, [session, needsPricing, pickerActive]);

  // ── Build request pricing params (dùng chung cho preview và checkout) ──
  // fresh (mode A): gửi groups; đã gán giá (mode B): full đúng 1 nhóm →
  // pricingGroupId+playerCount, subset/nhiều nhóm → playerIds; legacy → stepper.
  const buildPricingParams = useCallback(() => {
    if (!session) return null;
    if (!isMember && needsPricing && pickerActive) {
      const groups = pickerGroups
        .filter((g) => g.selectedIds.length > 0)
        .map((g) => ({
          playerCount: g.selectedIds.length,
          pricingRuleId: g.pricingRuleId,
          playerIds: g.selectedIds,
        }));
      if (groups.length === 0) return null;
      return { groups };
    }
    if (!isMember && pickerActive) {
      const singleGroup = pickerGroups.length === 1 ? pickerGroups[0] : null;
      const singleFull =
        singleGroup &&
        singleGroup.selectedIds.length === singleGroup.members.length &&
        singleGroup.members.length > 0;
      if (singleFull) {
        return {
          pricingGroupId: singleGroup.key,
          playerCount: singleGroup.selectedIds.length,
        };
      }
      const playerIds = pickerGroups.flatMap((g) => g.selectedIds);
      if (playerIds.length === 0) return null;
      return { playerIds };
    }
    if (!isMember && !sessionHasPlayers) {
      // Legacy stepper
      const groups = session.pricingGroups ?? [];
      if (selectedGroupId && groups.some((g) => g.id === selectedGroupId)) {
        return {
          pricingGroupId: selectedGroupId,
          playerCount: checkoutPlayerCount,
        };
      }
      if (isGroupSession && checkoutPlayerCount < sessionPlayerCount) {
        return { playerCount: checkoutPlayerCount };
      }
      return {};
    }
    return {};
  }, [
    session,
    isMember,
    needsPricing,
    pickerActive,
    sessionHasPlayers,
    pickerGroups,
    selectedGroupId,
    checkoutPlayerCount,
    isGroupSession,
    sessionPlayerCount,
  ]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!session) {
      setPlayQuote(null);
      setQuoteError("");
      return;
    }

    let cancelled = false;
    setPlayQuote(null);
    const loadQuote = async () => {
      setQuoteLoading(true);
      setQuoteError("");
      try {
        const params = new URLSearchParams();
        if (promotionRuleId) params.set("promotionRuleId", promotionRuleId);
        if (frozenAt) params.set("endTime", frozenAt);
        const pricingParams = buildPricingParams();
        if (pricingParams) {
          if ("groups" in pricingParams && pricingParams.groups) {
            params.set("groups", JSON.stringify(pricingParams.groups));
          } else if ("playerIds" in pricingParams && pricingParams.playerIds) {
            params.set("playerIds", JSON.stringify(pricingParams.playerIds));
          } else if (pricingParams.pricingGroupId) {
            params.set("pricingGroupId", pricingParams.pricingGroupId);
            if (pricingParams.playerCount)
              params.set("playerCount", String(pricingParams.playerCount));
          } else if (
            "playerCount" in pricingParams &&
            pricingParams.playerCount
          ) {
            params.set("playerCount", String(pricingParams.playerCount));
          }
        }
        const qs = params.toString();
        const data = await apiJson<PlayTimeQuote>(
          `/api/sessions/${session.id}/checkout-preview${qs ? `?${qs}` : ""}`,
        );
        if (!data.success || !data.data) {
          throw new Error(data.error || "Không tính được tiền giờ chơi");
        }
        if (!cancelled) setPlayQuote(data.data);
      } catch (quoteLoadError) {
        if (!cancelled)
          setQuoteError(
            (quoteLoadError as Error).message ||
              "Không tính được tiền giờ chơi",
          );
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };

    void loadQuote();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    session,
    promotionRuleId,
    frozenAt,
    buildPricingParams,
  ]);

  useEffect(() => {
    if (!session || session.customer?.type === "MEMBER" || !!session.membership)
      return;

    let cancelled = false;
    const loadPromotions = async () => {
      setPromotionsLoading(true);
      setPromotionsError("");
      try {
        const data = await apiJson<PromotionSnapshot[]>(
          "/api/promotions/available",
        );
        if (!data.success) {
          throw new Error(data.error || "Không tải được khuyến mại");
        }
        if (!cancelled) setPromotions(data.data ?? []);
      } catch (promotionLoadError) {
        if (!cancelled) {
          setPromotions([]);
          setPromotionsError(
            (promotionLoadError as Error).message ||
              "Không tải được khuyến mại",
          );
        }
      } finally {
        if (!cancelled) setPromotionsLoading(false);
      }
    };

    void loadPromotions();
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Preview đã trả tổng per-player (N người được thu) — không nhân count nữa
  const playSubtotal = playQuote?.subtotal ?? 0;
  const playDiscount = playQuote?.discountAmount ?? 0;
  const playTotal = playQuote?.grandTotal ?? 0;
  const pendingSellItems = useMemo(
    () => playQuote?.pendingSellItems ?? [],
    [playQuote],
  );
  // Mặc định chọn tất cả DRAFT invoices đang chưa thu; nhân viên có thể bỏ chọn.
  const availableDraftIds = useMemo(
    () =>
      Array.from(new Set(pendingSellItems.map((item) => item.draftInvoiceId))),
    [pendingSellItems],
  );
  const pendingSellTotal = useMemo(() => {
    const selected = new Set(selectedDraftInvoiceIds);
    return pendingSellItems
      .filter((item) => selected.has(item.draftInvoiceId))
      .reduce((sum, item) => sum + item.subtotal, 0);
  }, [pendingSellItems, selectedDraftInvoiceIds]);
  const parkingFeeUnitPrice = playQuote?.parkingFeeUnitPrice ?? 0;
  const parkingFeeTotal = parkingVehicleCount * parkingFeeUnitPrice;

  const cartLines = products
    .map((product) => ({
      product,
      quantity: cart[product.id] ?? 0,
      total: (cart[product.id] ?? 0) * toNumber(product.price),
    }))
    .filter((line) => line.quantity > 0);

  const productSubtotal = cartLines.reduce((sum, line) => sum + line.total, 0);
  const grandTotal = Math.max(
    0,
    playTotal + pendingSellTotal + productSubtotal - parkingFeeTotal,
  );

  const toggleDraftInvoice = (draftInvoiceId: string) => {
    setSelectedDraftInvoiceIds((current) =>
      current.includes(draftInvoiceId)
        ? current.filter((id) => id !== draftInvoiceId)
        : [...current, draftInvoiceId],
    );
  };

  // Mặc định chọn tất cả DRAFT invoices khi danh sách bán kèm được tải.
  useEffect(() => {
    if (availableDraftIds.length > 0 && !draftSelectionInitialized.current) {
      draftSelectionInitialized.current = true;
      setSelectedDraftInvoiceIds(availableDraftIds);
    }
  }, [availableDraftIds]);

  const pricingBlocked = needsPricing && applicablePricingRules.length === 0;
  // Chọn ít nhất 1 người khi dùng picker
  const hasAssignedPlayers = pickerActive ? selectedCount > 0 : true;

  // Cảnh báo: fresh + nhiều nhóm + thu trước (backend chỉ cho phép 1 nhóm subset)
  const freshMultiGroupPartial =
    needsPricing &&
    pickerActive &&
    pickerGroups.filter((g) => g.selectedIds.length > 0).length > 1 &&
    selectedCount < uncheckedTotal;

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

  const handleCheckout = async () => {
    if (!session) return;
    if (!shiftReady) {
      notifyError("Cần mở ca trước khi thu tiền");
      return;
    }
    if (needsPricing && applicablePricingRules.length === 0) {
      notifyError("Chưa có bảng giá hiệu lực — không thể thu tiền giờ chơi");
      return;
    }
    if (freshMultiGroupPartial) {
      notifyError("Thu trước chỉ hỗ trợ 1 nhóm — gộp về 1 nhóm hoặc thu hết");
      return;
    }
    if (pickerActive && !hasAssignedPlayers) {
      notifyError("Chọn ít nhất 1 người chơi trước khi thu tiền");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        paymentMethod,
        promotionRuleId: promotionRuleId || null,
        items: cartLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      };
      if (frozenAt) body.endTime = frozenAt;
      const pricingParams = buildPricingParams();
      if (pricingParams) {
        if ("groups" in pricingParams && pricingParams.groups) {
          body.groups = pricingParams.groups;
        } else if ("playerIds" in pricingParams && pricingParams.playerIds) {
          body.playerIds = pricingParams.playerIds;
        } else if (pricingParams.pricingGroupId) {
          body.pricingGroupId = pricingParams.pricingGroupId;
          if (pricingParams.playerCount)
            body.playerCount = pricingParams.playerCount;
        } else if (
          "playerCount" in pricingParams &&
          pricingParams.playerCount
        ) {
          body.playerCount = pricingParams.playerCount;
        }
      }
      if (parkingVehicleCount > 0) {
        body.parkingVehicleCount = parkingVehicleCount;
      }
      if (availableDraftIds.length > 0) {
        body.draftInvoiceIds = selectedDraftInvoiceIds;
      }
      const data = await apiJson<CheckoutResponse>(
        `/api/sessions/${session.id}/checkout`,
        jsonRequest(body),
      );

      if (!data.success) {
        notifyError(data.error || "Không checkout được");
        return;
      }

      notifySuccess(`Đã thu ${money(data.data?.grandTotal ?? grandTotal)}`);
      await onDone();
    } catch {
      notifyError("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  const getCtaLabel = () => {
    if (pickerActive) {
      if (isPartialBySelection)
        return `Thu trước ${selectedCount} người`;
      if (uncheckedTotal === 1)
        return "Thu tiền & kết thúc";
      return `Thu tiền ${selectedCount} người`;
    }
    if (!isMember && !sessionHasPlayers) {
      const group = selectedGroupId
        ? session?.pricingGroups?.find((g) => g.id === selectedGroupId)
        : undefined;
      if (group && checkoutPlayerCount < (group.remainingCount ?? sessionPlayerCount))
        return `Thu tiền ${checkoutPlayerCount} người`;
      if (group && (session?.pricingGroups?.length ?? 0) > 0)
        return `Thu tiền (${group.label ?? ""})`;
      if (isGroupSession && checkoutPlayerCount < sessionPlayerCount)
        return `Thu tiền ${checkoutPlayerCount} người`;
      return "Thu tiền & kết thúc";
    }
    return "Thu tiền & kết thúc";
  };

  return (
    <Modal
      open={!!session}
      onClose={onClose}
      variant="sheet"
      title={
        session
          ? `Thu tiền - ${session.customerName ?? session.customer?.fullName ?? "Khách lẻ"}`
          : "Thu tiền"
      }
      description={
        session
          ? `${isMember ? "Hội viên" : "Vãng lai"} · ${calcElapsedHMS(session.startTime, frozenAt ?? undefined, session.totalPausedSeconds ?? 0)}${isGroupSession ? ` · ${sessionPlayerCount} người` : ""}`
          : undefined
      }
      size="lg"
      footer={
        <div className="space-y-3">
          {/* ── Thông tin hoá đơn (mở mặc định, thu gọn được) ── */}
          <SectionCard title="Thông tin hoá đơn" defaultOpen>
            <div className="space-y-2">
              {quoteLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Đang tính tiền giờ chơi...</span>
                </div>
              ) : quoteError ? (
                <p className="text-sm text-red-600 dark:text-red-300">
                  {quoteError}
                </p>
              ) : (
                <>
                  <InvoiceRow label="Giờ chơi" value={money(playSubtotal)} />
                  {/* ── Chi tiết giá từng người chơi được thu ── */}
                  {playQuote?.playerPricing &&
                    playQuote.playerPricing.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-dashed border-zinc-200 pt-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                        {playQuote.playerPricing.map((p, index) => (
                          <div
                            key={p.id}
                            className="flex items-baseline justify-between gap-3"
                          >
                            <span className="truncate">
                              Ng. {index + 1}: {formatHours(p.totalHours)}h{" "}
                              {p.pricingRuleName
                                ? `(${p.pricingRuleName})`
                                : ""}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-zinc-950 dark:text-white">
                              = {money(p.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  {/* ── Thời gian chơi + đã tạm dừng (mọi phiên) ── */}
                  {session &&
                    (() => {
                      const groupHasPlayers =
                        (session.pricingGroups ?? []).some(
                          (g) => (g.players?.length ?? 0) > 0,
                        );
                      let pausedSeconds = playQuote?.pausedSeconds ?? 0;
                      if (pausedSeconds === 0 && !groupHasPlayers) {
                        const pausedAtRef = frozenAt
                          ? new Date(frozenAt).getTime()
                          : undefined;
                        pausedSeconds = pausedSecondsUntil(
                          session.pausedAt,
                          session.totalPausedSeconds ?? 0,
                          pausedAtRef,
                        );
                      }
                      const playTime = calcElapsedHMS(
                        session.startTime,
                        frozenAt ?? undefined,
                        pausedSeconds,
                      );
                      return (
                        <div className="mt-2 space-y-1 border-t border-dashed border-zinc-200 pt-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                          <div className="flex justify-between gap-3">
                            <span className="truncate">Thời gian chơi</span>
                            <span className="shrink-0 font-semibold tabular-nums text-zinc-950 dark:text-white">
                              {playTime}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="truncate">Đã tạm dừng</span>
                            <span className="shrink-0 tabular-nums">
                              {formatPausedHMS(pausedSeconds)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  {playQuote?.promotion && playDiscount > 0 && (
                    <div className="mt-2 flex justify-between gap-3 text-sm text-emerald-700 dark:text-emerald-300">
                      <span className="truncate">
                        Khuyến mại · {playQuote.promotion.name}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        -{money(playDiscount)}
                      </span>
                    </div>
                  )}
                  {playDiscount > 0 && (
                    <InvoiceRow
                      label="Tiền giờ chơi sau giảm"
                      value={money(playTotal)}
                    />
                  )}
                </>
              )}
              {pendingSellItems.length > 0 && (
                <div className="border-t border-dashed border-zinc-200 pt-3 dark:border-zinc-800">
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Đã thêm vào phiên (chưa thu) — chọn lần bán kèm cần thu
                  </p>
                  {availableDraftIds.map((draftId) => {
                    const draftItems = pendingSellItems.filter(
                      (item) => item.draftInvoiceId === draftId,
                    );
                    const draftTotal = draftItems.reduce(
                      (sum, item) => sum + item.subtotal,
                      0,
                    );
                    const selected = selectedDraftInvoiceIds.includes(draftId);
                    return (
                      <label
                        key={draftId}
                        className="mb-2 flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleDraftInvoice(draftId)}
                          className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                        />
                        <span className="flex-1">
                          <span className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-zinc-950 dark:text-white">
                              Bán kèm
                            </span>
                            <span className="text-sm tabular-nums text-zinc-950 dark:text-white">
                              {money(draftTotal)}
                            </span>
                          </span>
                          <span className="mt-1 space-y-1">
                            {draftItems.map((item, index) => (
                              <span
                                key={`${item.productId}-${index}`}
                                className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400"
                              >
                                <span>
                                  {item.productName} x{item.quantity}
                                </span>
                                <span className="tabular-nums">
                                  {money(item.subtotal)}
                                </span>
                              </span>
                            ))}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {cartLines.map((line) => (
                <InvoiceRow
                  key={line.product.id}
                  label={`${line.product.name} x${line.quantity}`}
                  value={money(line.total)}
                />
              ))}
              {parkingFeeTotal > 0 && (
                <InvoiceRow
                  label="Phí gửi xe"
                  value={`-${money(parkingFeeTotal)}`}
                  warning
                />
              )}
            </div>
          </SectionCard>
          {/* Total + CTA — grouped as a single pay zone for dominant focal point */}
          <div className="overflow-hidden rounded-xl border-2 border-zinc-950 dark:border-white">
            {/* Disabled reason — visible explanation for why CTA is blocked */}
            {quoteLoading ? (
              <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                Đang tính tiền giờ chơi...
              </p>
            ) : pricingBlocked ? (
              <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                Chưa có bảng giá hiệu lực — chưa thể thu tiền.
              </p>
            ) : quoteError ? (
              <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {quoteError}
              </p>
            ) : !shiftReady ? (
              <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                Cần mở ca trước khi thu tiền.
              </p>
            ) : freshMultiGroupPartial ? (
              <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                Thu trước chỉ hỗ trợ 1 nhóm — gộp về 1 nhóm hoặc thu hết.
              </p>
            ) : pickerActive && !hasAssignedPlayers ? (
              <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                Chọn ít nhất 1 người chơi trước khi thu tiền.
              </p>
            ) : null}
            <div className="flex items-center justify-between bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
              <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                Tổng thu
              </span>
              <span className="text-xl font-extrabold tabular-nums text-zinc-950 dark:text-white">
                {quoteError ? "—" : money(grandTotal)}
              </span>
            </div>
            <Button
              variant="inverse"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={
                !shiftReady ||
                quoteLoading ||
                !!quoteError ||
                !playQuote ||
                pricingBlocked ||
                freshMultiGroupPartial ||
                (pickerActive && !hasAssignedPlayers)
              }
              onClick={handleCheckout}
            >
              {getCtaLabel()}
            </Button>
          </div>
        </div>
      }
    >
      {session && (
        <div className="space-y-4">
          {/* ── Người chơi & bảng giá — luồng thống nhất (vãng lai có player rows) ── */}
          {pickerActive && (
            <SectionCard
              title="Người chơi & bảng giá"
              collapsible={false}
              className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5"
            >
              {pricingBlocked ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  Chưa có bảng giá hiệu lực — không thể thu tiền giờ chơi.
                </p>
              ) : (
                <>
                  <CheckoutPlayerPicker
                    groups={pickerGroups}
                    rules={applicablePricingRules}
                    onChange={setPickerGroups}
                  />
                  {needsPricing &&
                    selectedCount > 0 &&
                    selectedCount < sessionPlayerCount && (
                      <p className="text-sm text-amber-600 dark:text-amber-300">
                        Thu trước{" "}
                        <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">
                          {selectedCount}
                        </span>
                        /{sessionPlayerCount} người — người chưa chọn tiếp tục
                        chơi.
                      </p>
                    )}
                  {!needsPricing && isPartialBySelection && (
                    <p className="text-sm text-amber-600 dark:text-amber-300">
                      Thu trước{" "}
                      <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">
                        {selectedCount}
                      </span>
                      /{uncheckedTotal} người — người chưa thu tiếp tục chơi.
                    </p>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {/* Legacy: session cũ không có player rows — giữ stepper như trước */}
          {!isMember && !sessionHasPlayers && (session.pricingGroups?.length ?? 0) > 0 && (
            <SectionCard
              title="Nâng cao"
              summary={
                selectedGroupId
                  ? `${session.pricingGroups!.find((g) => g.id === selectedGroupId)?.label ?? "Nhóm 1"} · ${checkoutPlayerCount} người`
                  : `${(session.pricingGroups ?? []).filter((g) => g.remainingCount > 0).length} nhóm`
              }
            >
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Nhóm giá
                {selectedGroupId
                  ? ` · ${session.pricingGroups!.find((g) => g.id === selectedGroupId)?.label ?? ""}`
                  : ""}
              </p>
              <div className="space-y-2">
                {session
                  .pricingGroups!.filter((g) => g.remainingCount > 0)
                  .map((g) => {
                    const isSelected = selectedGroupId === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setSelectedGroupId(g.id);
                          setCheckoutPlayerCount(g.remainingCount);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                            {g.label}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {g.pricingSnapshot?.name ?? "Bảng giá"} ·{" "}
                            {money(g.hourlyRate)}/giờ
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
                            {g.remainingCount} người
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Còn {g.remainingCount}/{g.playerCount}
                          </p>
                        </div>
                      </button>
                    );
                  })}
              </div>
              {selectedGroupId && (
                <LegacyStepper
                  checkoutPlayerCount={checkoutPlayerCount}
                  maxCount={
                    session.pricingGroups!.find(
                      (g) => g.id === selectedGroupId,
                    )?.remainingCount ?? sessionPlayerCount
                  }
                  unitLabel="người trong nhóm"
                  onDecrease={() =>
                    setCheckoutPlayerCount((c) => Math.max(1, c - 1))
                  }
                  onIncrease={() =>
                    setCheckoutPlayerCount((c) =>
                      Math.min(
                        session.pricingGroups!.find(
                          (g) => g.id === selectedGroupId,
                        )?.remainingCount ?? sessionPlayerCount,
                        c + 1,
                      ),
                    )
                  }
                  warning={
                    checkoutPlayerCount <
                    (session.pricingGroups!.find(
                      (g) => g.id === selectedGroupId,
                    )?.remainingCount ?? sessionPlayerCount)
                      ? `Thu ${checkoutPlayerCount} người — nhóm còn người, thu tiếp sau.`
                      : undefined
                  }
                />
              )}
            </SectionCard>
          )}

          {!isMember &&
            !sessionHasPlayers &&
            (session.pricingGroups?.length ?? 0) === 0 &&
            isGroupSession && (
              <SectionCard
                title="Nâng cao"
                summary={`${checkoutPlayerCount} người`}
              >
                <LegacyStepper
                  checkoutPlayerCount={checkoutPlayerCount}
                  maxCount={sessionPlayerCount}
                  unitLabel="người trong phiên"
                  onDecrease={() =>
                    setCheckoutPlayerCount((c) => Math.max(1, c - 1))
                  }
                  onIncrease={() =>
                    setCheckoutPlayerCount((c) =>
                      Math.min(sessionPlayerCount, c + 1),
                    )
                  }
                  warning={
                    checkoutPlayerCount < sessionPlayerCount
                      ? `Thu ${checkoutPlayerCount} người — phiên còn ${sessionPlayerCount - checkoutPlayerCount} người, thu tiếp sau.`
                      : undefined
                  }
                />
              </SectionCard>
            )}

          {!isMember && (
            <SectionCard
              title="Khuyến mại giờ chơi"
              collapsible={false}
              summary={
                promotionRuleId
                  ? promotions.find((p) => p.ruleId === promotionRuleId)?.name
                  : undefined
              }
            >
              <Select
                id="checkout-promotion"
                value={promotionRuleId}
                disabled={promotionsLoading}
                onChange={(event) => setPromotionRuleId(event.target.value)}
              >
                <option value="">Không áp dụng khuyến mại</option>
                {promotions.map((promotion) => (
                  <option key={promotion.ruleId} value={promotion.ruleId}>
                    {formatPromotionOption(promotion)}
                  </option>
                ))}
              </Select>
              {promotionsError ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                  {promotionsError}
                </p>
              ) : null}
            </SectionCard>
          )}

          {/* Phí gửi xe (trừ vào tổng thanh toán) — chỉ khách vãng lai */}
          {!isMember && parkingFeeUnitPrice > 0 && (
            <SectionCard
              title="Phí gửi xe"
              collapsible={false}
              summary={
                parkingVehicleCount > 0
                  ? `${parkingVehicleCount} xe`
                  : undefined
              }
            >
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {money(parkingFeeUnitPrice)}/xe
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setParkingVehicleCount((c) => Math.max(0, c - 1))
                  }
                  disabled={parkingVehicleCount === 0}
                  className={stepperMinus}
                >
                  <Minus size={14} />
                </button>
                <span className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
                  {parkingVehicleCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setParkingVehicleCount((c) => Math.min(20, c + 1))
                  }
                  className={stepperPlus}
                >
                  <Plus size={14} />
                </button>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  xe
                </span>
              </div>
              {parkingVehicleCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-500 dark:text-red-300">
                    Tạm tính trừ
                  </span>
                  <span className="font-semibold text-red-600 dark:text-red-300 tabular-nums">
                    -{money(parkingFeeTotal)}
                  </span>
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard
            title="Đồ uống / dịch vụ"
            summary={
              cartLines.length > 0 ? `${cartLines.length} món` : undefined
            }
          >
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {products.length === 0 ? (
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
                          className={productMinus}
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
                          className={productPlus}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </SectionCard>

          <div>
            <Label htmlFor="payment-method">Phương thức thanh toán</Label>
            <Select
              id="payment-method"
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(event.target.value as PaymentMethod)
              }
            >
              <option value="CASH">{paymentMethodLabel("CASH")}</option>
              <option value="TRANSFER">{paymentMethodLabel("TRANSFER")}</option>
              <option value="CARD">{paymentMethodLabel("CARD")}</option>
            </Select>
            {paymentMethod === "TRANSFER" && (
              <div className="mt-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="mb-2 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Quét mã QR để chuyển khoản
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/transfer.png"
                  alt="Mã QR chuyển khoản"
                  loading="lazy"
                  className="mx-auto w-48 max-w-full"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Định dạng số giờ 1 chữ số thập phân, bỏ số 0 thừa (1.4, 2.3) */
function formatHours(hours: number): string {
  return (Math.round(hours * 10) / 10).toString();
}

/** Stepper số người thu — dùng cho session cũ không có player rows (legacy) */
function LegacyStepper({
  checkoutPlayerCount,
  maxCount,
  unitLabel,
  onDecrease,
  onIncrease,
  warning,
}: {
  checkoutPlayerCount: number;
  maxCount: number;
  unitLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  warning?: string;
}) {
  return (
    <>
      <div className="border-t border-zinc-200 dark:border-zinc-800" />
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Số người thu
        </p>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {checkoutPlayerCount} người
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onDecrease}
          disabled={checkoutPlayerCount <= 1}
          className={stepperMinus}
        >
          <Minus size={14} />
        </button>
        <span className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
          {checkoutPlayerCount}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          disabled={checkoutPlayerCount >= maxCount}
          className={stepperPlus}
        >
          <Plus size={14} />
        </button>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          / {maxCount} {unitLabel}
        </span>
      </div>
      {warning && (
        <p className="text-xs text-amber-600 dark:text-amber-300">{warning}</p>
      )}
    </>
  );
}
