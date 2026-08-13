"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { GroupBuilder, type CheckoutGroup } from "./group-builder";
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
  const [checkoutPlayerCount, setCheckoutPlayerCount] = useState(1);
  const [playQuote, setPlayQuote] = useState<PlayTimeQuote | null>(null);
  const [promotions, setPromotions] = useState<PromotionSnapshot[]>([]);
  const [promotionRuleId, setPromotionRuleId] = useState("");
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotionsError, setPromotionsError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [parkingVehicleCount, setParkingVehicleCount] = useState(0);
  // Bảng giá chọn tại checkout — session khách vãng lai chưa gán giá lúc check-in
  const [applicablePricingRules, setApplicablePricingRules] = useState<
    PricingRuleOption[]
  >([]);
  const [checkoutGroups, setCheckoutGroups] = useState<CheckoutGroup[]>([]);
  // Thu trước: người chơi cụ thể được chọn để thu trong group đã chọn (session đã gán giá).
  // Mặc định chọn tất cả người chưa thu; bỏ chọn bớt → thu trước (chỉ thu những người được chọn).
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  const isMember =
    session?.customer?.type === "MEMBER" || !!session?.membership;
  const sessionPlayerCount = session?.playerCount ?? 1;
  const isGroupSession = sessionPlayerCount > 1;

  // Danh sách người chơi (chọn tay vào nhóm bảng giá)
  const sessionPlayers = (session?.pricingGroups ?? []).flatMap((g) =>
    (g.players ?? []).map((p) => ({ id: p.id, name: p.name ?? null })),
  );

  // ── Thu trước (session đã gán giá): người chưa thu của group đang chọn ──
  const selectedGroup = useMemo(
    () =>
      selectedGroupId
        ? (session?.pricingGroups ?? []).find((g) => g.id === selectedGroupId)
        : undefined,
    [session, selectedGroupId],
  );
  const uncheckedPlayersInGroup = useMemo(
    () => (selectedGroup?.players ?? []).filter((p) => !p.checkedOutAt),
    [selectedGroup],
  );
  const uncheckedCountInGroup = uncheckedPlayersInGroup.length;
  // Người được chọn để thu lần này — mặc định tất cả (thu hết); bỏ chọn bớt → thu trước
  const activeSelectedPlayerIds = useMemo(
    () =>
      uncheckedPlayersInGroup.length > 0
        ? selectedPlayerIds.filter((pid) =>
            uncheckedPlayersInGroup.some((p) => p.id === pid),
          )
        : [],
    [uncheckedPlayersInGroup, selectedPlayerIds],
  );
  // Số người thu thực tế cho group đã chọn: theo người được chọn (nếu có player rows), ngược lại theo count stepper
  const effectiveCheckoutCount =
    uncheckedCountInGroup > 0
      ? activeSelectedPlayerIds.length
      : checkoutPlayerCount;
  // Đang thu trước (bỏ chọn bớt người) — chỉ khi có player rows và số chọn < tổng người chưa thu
  const isPartialByPlayers =
    uncheckedCountInGroup > 0 &&
    activeSelectedPlayerIds.length < uncheckedCountInGroup;

  // Session check-in mới (để trống giá) — cần chọn bảng giá khi thu tiền
  const needsPricing =
    !!session &&
    !isMember &&
    (session.pricingGroups?.length ?? 0) > 0 &&
    session.pricingGroups!.every(
      (g) => !g.pricingSnapshot && Number(g.hourlyRate) === 0,
    );

  useEffect(() => {
    if (session) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setPaymentMethod("CASH");
      setCart({});
      setPromotionRuleId("");
      setPromotions([]);
      setPromotionsError("");
      const groups = session.pricingGroups ?? [];
      const firstActive = groups.find((g) => g.remainingCount > 0);
      setSelectedGroupId(firstActive?.id ?? "");
      setCheckoutPlayerCount(
        firstActive?.remainingCount ?? session.playerCount ?? 1,
      );
      setParkingVehicleCount(0);
      // Reset bảng giá checkout
      setCheckoutGroups([]);
      setApplicablePricingRules([]);
      // Mặc định chọn tất cả người chưa thu của group đầu tiên (thu hết = không phải thu trước)
      const firstUnchecked = (firstActive?.players ?? [])
        .filter((p) => !p.checkedOutAt)
        .map((p) => p.id);
      setSelectedPlayerIds(firstUnchecked);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [session]);

  // Fetch bảng giá hiện hành khi mở drawer với session cần gán giá
  useEffect(() => {
    if (!session || !needsPricing) return;
    let cancelled = false;
    const allPlayerIds = (session.pricingGroups ?? []).flatMap((g) =>
      (g.players ?? []).map((p) => p.id),
    );
    const loadRules = async () => {
      try {
        const data = await apiJson<PricingRuleOption[]>(
          "/api/pricing/applicable",
        );
        if (data.success && !cancelled) {
          const rules = data.data ?? [];
          setApplicablePricingRules(rules);
          // Mặc định 1 nhóm gồm toàn bộ người chơi, bảng giá đầu tiên
          setCheckoutGroups((current) =>
            current.length > 0
              ? current
              : [
                  {
                    playerIds: allPlayerIds,
                    pricingRuleId: rules[0]?.id ?? "",
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
  }, [session, needsPricing]);

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
        // Session cần gán giá → luôn gửi groups (mặc định 1 nhóm = toàn bộ người + 1 bảng giá)
        if (needsPricing) {
          if (checkoutGroups.length > 0) {
            params.set(
              "groups",
              JSON.stringify(
                checkoutGroups.map((g) => ({
                  playerCount: g.playerIds.length,
                  pricingRuleId: g.pricingRuleId,
                  playerIds: g.playerIds,
                })),
              ),
            );
          }
        } else {
          // Thu trước: chọn người cụ thể (bất kỳ nhóm nào) — gửi playerIds cho quote per-player
          if (isPartialByPlayers && activeSelectedPlayerIds.length > 0) {
            params.set("playerIds", JSON.stringify(activeSelectedPlayerIds));
          } else {
            if (selectedGroupId) params.set("pricingGroupId", selectedGroupId);
            // Số người thu lần này — preview tính per-player đúng N người
            if (checkoutPlayerCount > 0)
              params.set("playerCount", String(checkoutPlayerCount));
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
    needsPricing,
    checkoutGroups,
    selectedGroupId,
    frozenAt,
    checkoutPlayerCount,
    isPartialByPlayers,
    activeSelectedPlayerIds,
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
  const pendingSellTotal = playQuote?.pendingSellTotal ?? 0;
  const pendingSellItems = playQuote?.pendingSellItems ?? [];
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

  const pricingBlocked = needsPricing && applicablePricingRules.length === 0;

  // Chọn bảng giá tại checkout: mặc định 1 nhóm (1 bảng giá); thêm nhóm để nhiều bảng giá
  const groupMode = needsPricing && checkoutGroups.length > 0;
  // Có ít nhất 1 người được phân vào nhóm — thu trước cho phép bỏ chọn bớt người (subset)
  const hasAssignedPlayers = groupMode
    ? new Set(checkoutGroups.flatMap((g) => g.playerIds)).size > 0
    : true;
  // Thu trước (fresh session, GroupBuilder subset) — không phân hết người cũng được
  const assignedCount = groupMode
    ? new Set(checkoutGroups.flatMap((g) => g.playerIds)).size
    : sessionPlayerCount;

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
    if (groupMode && !hasAssignedPlayers) {
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
      // Session cần gán bảng giá → luôn gửi groups (mặc định 1 nhóm = 1 bảng giá)
      if (needsPricing) {
        if (checkoutGroups.length > 0) {
          body.groups = checkoutGroups.map((g) => ({
            playerCount: g.playerIds.length,
            pricingRuleId: g.pricingRuleId,
            playerIds: g.playerIds,
          }));
        }
      } else {
        // Thu trước: chọn người cụ thể → gửi playerIds (backend tự detect thu trước theo số người)
        if (isPartialByPlayers && activeSelectedPlayerIds.length > 0) {
          body.playerIds = activeSelectedPlayerIds;
        } else {
          // Nếu có pricing groups, gửi pricingGroupId
          const groups = session.pricingGroups ?? [];
          if (selectedGroupId && groups.some((g) => g.id === selectedGroupId)) {
            body.pricingGroupId = selectedGroupId;
            body.playerCount = effectiveCheckoutCount;
          } else if (
            isGroupSession &&
            checkoutPlayerCount < sessionPlayerCount
          ) {
            body.playerCount = checkoutPlayerCount;
          }
        }
      }
      if (parkingVehicleCount > 0) {
        body.parkingVehicleCount = parkingVehicleCount;
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
    if (isPartialByPlayers)
      return `Thu trước ${activeSelectedPlayerIds.length} người`;
    if (groupMode) {
      if (assignedCount < sessionPlayerCount)
        return `Thu trước ${assignedCount} người`;
      return `Thu tiền ${assignedCount} người`;
    }
    if (needsPricing) return `Thu tiền ${effectiveCheckoutCount} người`;
    const group = selectedGroupId
      ? session?.pricingGroups?.find((g) => g.id === selectedGroupId)
      : undefined;
    if (group && effectiveCheckoutCount < (group.remainingCount ?? sessionPlayerCount))
      return `Thu tiền ${effectiveCheckoutCount} người`;
    if (group && (session?.pricingGroups?.length ?? 0) > 0)
      return `Thu tiền (${group.label ?? ""})`;
    if (isGroupSession && effectiveCheckoutCount < sessionPlayerCount)
      return `Thu tiền ${effectiveCheckoutCount} người`;
    return "Thu tiền & kết thúc";
  };

  return (
    <Modal
      open={!!session}
      onClose={onClose}
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
          {/* ── Thông tin hoá đơn (luôn hiển thị) ── */}
          <SectionCard title="Thông tin hoá đơn" collapsible={false}>
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
                  {isGroupSession ? (
                    <InvoiceRow label="Giờ chơi" value={money(playSubtotal)} />
                  ) : (
                    <InvoiceRow
                      label={
                        isMember ? "Giờ chơi hội viên" : "Giờ chơi vãng lai"
                      }
                      value={money(playSubtotal)}
                    />
                  )}
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
                      const selectedGroup = selectedGroupId
                        ? session.pricingGroups?.find(
                            (g) => g.id === selectedGroupId,
                          )
                        : undefined;
                      // Group có player rows → thời gian tạm dừng tính theo từng người trong group (từ quote)
                      const groupHasPlayers =
                        (selectedGroup?.players?.length ?? 0) > 0;
                      let pausedSeconds = groupHasPlayers
                        ? (playQuote?.pricingGroups?.find(
                            (g) => g.id === selectedGroupId,
                          )?.pausedSeconds ?? 0)
                        : (playQuote?.pausedSeconds ?? 0);
                      // Fallback khi chưa có quote: tính tại chỗ theo session-level (chốt theo frozenAt)
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
                            <span className="truncate">
                              Thời gian chơi
                              {groupHasPlayers && selectedGroup
                                ? ` (${selectedGroup.label})`
                                : ""}
                            </span>
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
                    Đã thêm vào phiên (chưa thu)
                  </p>
                  {pendingSellItems.map((item, index) => (
                    <InvoiceRow
                      key={`${item.productId}-${index}`}
                      label={`${item.productName} x${item.quantity}`}
                      value={money(item.subtotal)}
                    />
                  ))}
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
            ) : groupMode && !hasAssignedPlayers ? (
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
                (groupMode && !hasAssignedPlayers)
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
          {/* ── Chọn bảng giá tại checkout — session mới chưa gán giá ── */}
          {needsPricing && (
            <SectionCard
              title="Bước 1 • Bảng giá"
              collapsible={false}
              className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5"
            >
              {pricingBlocked ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  Chưa có bảng giá hiệu lực — không thể thu tiền giờ chơi.
                </p>
              ) : (
                <>
                  <GroupBuilder
                    players={sessionPlayers}
                    groups={checkoutGroups}
                    onChange={setCheckoutGroups}
                    applicablePricingRules={applicablePricingRules}
                  />

                  {checkoutGroups.length > 0 && (
                    <>
                      {assignedCount < sessionPlayerCount ? (
                        <p className="text-sm text-amber-600 dark:text-amber-300">
                          Thu trước{" "}
                          <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">
                            {assignedCount}
                          </span>
                          /{sessionPlayerCount} người — người chưa chọn tiếp tục
                          chơi.
                        </p>
                      ) : (
                        <p className="text-sm text-zinc-600 dark:text-zinc-300">
                          Thu hết{" "}
                          <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">
                            {assignedCount}
                          </span>{" "}
                          người — mỗi nhóm tính theo bảng giá riêng.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {/* Nâng cao: chọn nhóm giá, số người thu, người được thu — khách vãng lai phiên đã gán giá */}
          {!needsPricing &&
          !isMember &&
          (session.pricingGroups?.length ?? 0) > 0 ? (
            <SectionCard
              title="Nâng cao"
              summary={
                selectedGroupId
                  ? `${session.pricingGroups!.find((g) => g.id === selectedGroupId)?.label ?? "Nhóm 1"} · ${checkoutPlayerCount} người`
                  : `${(session.pricingGroups ?? []).filter((g) => g.remainingCount > 0).length} nhóm`
              }
            >
              {/* Nhóm giá */}
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
                          setSelectedPlayerIds(
                            (g.players ?? [])
                              .filter((p) => !p.checkedOutAt)
                              .map((p) => p.id),
                          );
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

              {/* Số người thu — nhóm đã chọn */}
              {!needsPricing &&
                !isMember &&
                selectedGroupId &&
                (session.pricingGroups?.length ?? 0) > 0 &&
                (() => {
                  const selectedGroup = session.pricingGroups!.find(
                    (g) => g.id === selectedGroupId,
                  );
                  if (!selectedGroup) return null;
                  const groupMax = selectedGroup.remainingCount;
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
                          onClick={() =>
                            setCheckoutPlayerCount((c) => Math.max(1, c - 1))
                          }
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
                          onClick={() =>
                            setCheckoutPlayerCount((c) =>
                              Math.min(groupMax, c + 1),
                            )
                          }
                          disabled={checkoutPlayerCount >= groupMax}
                          className={stepperPlus}
                        >
                          <Plus size={14} />
                        </button>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          / {groupMax} người trong nhóm
                        </span>
                      </div>
                      {checkoutPlayerCount < groupMax && (
                        <p className="text-xs text-amber-600 dark:text-amber-300">
                          Thu {checkoutPlayerCount} người — nhóm còn{" "}
                          {groupMax - checkoutPlayerCount} người, thu tiếp
                          sau.
                        </p>
                      )}
                    </>
                  );
                })()}

              {/* Số người thu — không chọn nhóm */}
              {!needsPricing &&
                !isMember &&
                isGroupSession &&
                !selectedGroupId && (
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
                        onClick={() =>
                          setCheckoutPlayerCount((c) => Math.max(1, c - 1))
                        }
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
                        onClick={() =>
                          setCheckoutPlayerCount((c) =>
                            Math.min(sessionPlayerCount, c + 1),
                          )
                        }
                        disabled={checkoutPlayerCount >= sessionPlayerCount}
                        className={stepperPlus}
                      >
                        <Plus size={14} />
                      </button>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        / {sessionPlayerCount} người trong phiên
                      </span>
                    </div>
                    {checkoutPlayerCount < sessionPlayerCount && (
                      <p className="text-xs text-amber-600 dark:text-amber-300">
                        Thu {checkoutPlayerCount} người — phiên còn{" "}
                        {sessionPlayerCount - checkoutPlayerCount} người, thu
                        tiếp sau.
                      </p>
                    )}
                  </>
                )}

              {/* Người chơi sẽ thu — bỏ chọn bớt người để thu trước (session đã gán giá) */}
              {!needsPricing &&
                !isMember &&
                uncheckedPlayersInGroup.length > 0 && (
                  <>
                    <div className="border-t border-zinc-200 dark:border-zinc-800" />
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Người chơi sẽ thu
                      </p>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {activeSelectedPlayerIds.length}/{uncheckedCountInGroup} người
                      </span>
                    </div>
                    <div className="space-y-2">
                      {uncheckedPlayersInGroup.map((p) => {
                        const isSelected = activeSelectedPlayerIds.includes(
                          p.id,
                        );
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedPlayerIds((current) =>
                                isSelected
                                  ? current.filter((pid) => pid !== p.id)
                                  : [...current, p.id],
                              );
                            }}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                              isSelected
                                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                            }`}
                          >
                            <span className="min-w-0 truncate text-sm font-medium text-zinc-950 dark:text-white">
                              {p.name?.trim() || "Người chơi"}
                            </span>
                            <span className="shrink-0">
                              {isSelected ? (
                                <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                                  Chọn
                                </span>
                              ) : (
                                <span className="rounded-md bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                                  Bỏ chọn
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {isPartialByPlayers && (
                      <p className="text-xs text-amber-600 dark:text-amber-300">
                        Thu trước {activeSelectedPlayerIds.length}/
                        {uncheckedCountInGroup} người — người chưa thu tiếp
                        tục chơi.
                      </p>
                    )}
                  </>
                )}
            </SectionCard>
          ) : null}

          {/* Divider: tách bước thiết lập giá (bắt buộc) khỏi các mục thêm (tùy chọn) */}
          {(needsPricing || (!isMember && (session?.pricingGroups?.length ?? 0) > 0)) && (
            <div className="relative py-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900">
                  Thêm món & dịch vụ
                </span>
              </div>
            </div>
          )}

          {!isMember && (
            <SectionCard
              title="Khuyến mại giờ chơi"
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
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {money(parkingFeeUnitPrice)}/xe
                </span>
              </div>
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
