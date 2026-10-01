"use client";

/**
 * ── DIRECTION CONTRACT — Dialog thu tiền (CheckoutDrawer) ─────────────────
 * THESIS: Hoá đơn là một PHIẾU HAI LIÊN, không phải một chồng mục. Liên 1
 *   TÍNH TIỀN nói đang tính cái gì (từng người chơi, hàng hoá/dịch vụ) và kết
 *   bằng Tạm tính; liên 2 THU TIỀN nói giảm gì và thu thế nào (khuyến mại,
 *   gửi xe, tiền cọc, phương thức) rồi kết ở chân phiếu bằng Cần thu. Từ chối:
 *   chuỗi tiền chạy qua ba khu vực rời — số từng người ở mục "Giờ chơi", hàng
 *   hoá ở mục "Tổng tiền", tổng ở footer — nên không đọc lại được phép cộng;
 *   và hàng chỉ-để-đọc nằm lẫn với hàng có control trong cùng một mục.
 * OWN-WORLD: Ink & Gold Ledger — token trong src/app/globals.css, chữ 12/14px,
 *   số tabular-nums trên một rail phải cố định, viền hairline 1px, phẳng mặc
 *   định; khoản trừ dùng text-danger kèm dấu trừ tường minh.
 * STORY: Nhân viên đọc liên 1 để biết đang tính gì, đọc liên 2 để biết vì sao
 *   ra số cuối, rồi bấm một nút ở chân — không phải cộng nhẩm.
 * FIRST VIEWPORT (mobile 390px): dải khách → LIÊN 1 · TÍNH TIỀN (mỗi người
 *   chơi một dòng tiền trên rail chung) → TẠM TÍNH → LIÊN 2 · THU TIỀN
 *   (khuyến mại, phí gửi xe, tiền cọc) → TỔNG → phương thức → chân dính
 *   "Cần thu" + nút Thu.
 * FORM: phiếu hai liên — người dùng chốt trong tay 3 cấu trúc (seed surface
 *   bb34d5e8), code-led, không sinh comp. Nâng từ 3 cấu trúc thua: rail tiền
 *   cố định (màn ký tự), dòng đổi thì giữ nguyên chỗ và chỉ mờ đi (bảng sân
 *   bay), các khoản điều chỉnh là MỘT lớp mỏng tách khỏi danh sách khoản thu
 *   (lá acetate).
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { apiJson, jsonRequest } from "@/lib/api";
import {
  calcElapsedHMS,
  formatPausedHMS,
  money,
  pausedSecondsUntil,
  toNumber,
} from "./format";
import { formatPromotionOption } from "./promotion-option";
import { PaymentMethodPicker } from "./payment-method-picker";
import { groupPausedSeconds } from "@/lib/sessions/ports";
import { precalcPlayTime, type PrecalcPlayer, type PrecalcRule } from "./checkout-precalc";
import { checkoutTotals } from "./checkout-totals";
import {
  CheckoutPlayerPicker,
  GROUP_LABEL,
  MONEY_RAIL,
  type PickerGroup,
  type PickerMemberStat,
} from "./checkout-player-picker";
import {
  InlineProductEditor,
} from "./invoice-detail-content";
import type { InvoiceEditorLine } from "./invoice-edit-logic";
import type { PlayTimeQuote, PromotionSnapshot } from "@/types";
import type { PaymentMethod, Product, SessionRow } from "./types";

/**
 * Phiếu ghi số tiền chính xác đến từng đồng — không làm tròn lên hàng nghìn,
 * vì các dòng phải cộng lại đúng bằng Tạm tính/Tổng hiện trên phiếu và đúng
 * bằng số hoá đơn sẽ ghi.
 */
function billMoney(value: number | string | null | undefined): string {
  return money(value, false);
}

/** Dòng hàng của phiếu: [ô chọn] nhãn + meta ‖ tiền trên rail chung */
function LedgerRow({
  label,
  meta,
  amount,
  checked = true,
  busy,
  dimmed,
  onUncheck,
}: {
  label: string;
  meta?: ReactNode;
  amount: string;
  checked?: boolean;
  busy?: boolean;
  /** Số chưa được server xác nhận — làm mờ để không đọc như số chốt */
  dimmed?: boolean;
  onUncheck?: () => void;
}) {
  const content = (
    <>
      {onUncheck ? (
        <input
          type="checkbox"
          checked={checked}
          disabled={busy}
          onChange={onUncheck}
          tabIndex={-1}
          className="pointer-events-none relative mt-1 h-5 w-5 shrink-0 appearance-none rounded-full border border-border-strong bg-surface-elevated checked:border-info checked:bg-info after:absolute after:inset-0 after:m-auto after:h-[8px] after:w-[4px] after:rotate-45 after:border-b-2 after:border-r-2 after:border-white after:opacity-0 after:content-[''] checked:after:opacity-100 focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm leading-tight ${
            checked ? "text-text-primary" : "text-text-tertiary"
          }`}
        >
          {label}
        </span>
        {meta ? (
          <span className="block text-xs tabular-nums text-text-tertiary">
            {meta}
          </span>
        ) : null}
      </span>
      <span
        className={`${MONEY_RAIL} text-sm ${
          checked
            ? "font-medium text-text-primary"
            : "text-text-tertiary line-through"
        } ${dimmed ? "opacity-60" : ""}`}
      >
        {amount}
      </span>
    </>
  );

  return onUncheck ? (
    <button
      type="button"
      onClick={onUncheck}
      disabled={busy}
      aria-pressed={checked}
      className="flex w-full items-start gap-3 py-2.5 text-left transition-colors active:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed"
    >
      {content}
    </button>
  ) : (
    <div className="flex items-start gap-3 py-2.5">{content}</div>
  );
}

/** Dòng điều chỉnh của liên 2: nhãn + gợi ý ‖ tiền, control nằm dòng dưới */
function AdjustRow({
  label,
  hint,
  amount,
  tone = "plain",
  dimmed,
  control,
}: {
  label: string;
  hint?: string;
  amount: string;
  tone?: "plain" | "minus" | "muted";
  dimmed?: boolean;
  control?: ReactNode;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1 text-sm text-text-secondary">
          {label}
          {hint ? <span className="text-xs text-text-secondary"> · {hint}</span> : null}
        </span>
          <span
          className={`${MONEY_RAIL} text-sm ${
            tone === "minus"
              ? "font-medium text-danger"
              : tone === "muted"
                ? "text-text-secondary"
                : "font-medium text-text-primary"
          } ${dimmed ? "opacity-60" : ""}`}
        >
          {amount}
        </span>
      </div>
      {control ? <div className="mt-2">{control}</div> : null}
    </div>
  );
}

/**
 * Dòng chốt của phiếu. `sub` = tạm tính của liên 1 (mực nhạt hơn); `final` =
 * tổng thật của liên 2 (mực đậm nhất trong thân phiếu, ngang hàng với Cần thu
 * ở chân — nên chân phiếu không cần thêm một cỡ chữ Display thứ hai).
 */
function TotalRow({
  label,
  amount,
  dimmed,
  emphasis = "sub",
}: {
  label: string;
  amount: string;
  dimmed?: boolean;
  emphasis?: "sub" | "final";
}) {
  const isFinal = emphasis === "final";
  return (
    <div
      className={`flex items-center justify-between gap-3 border-t py-2.5 ${
        isFinal ? "border-border-strong" : "border-border-default"
      }`}
    >
      <span
        className={`text-sm ${
          isFinal
            ? "font-semibold text-text-primary"
            : "text-text-secondary"
        }`}
      >
        {label}
      </span>
      <span
        className={`${MONEY_RAIL} text-sm ${
          isFinal
            ? "font-semibold text-text-primary"
            : "font-medium text-text-secondary"
        } ${dimmed ? "opacity-60" : ""}`}
      >
        {amount}
      </span>
    </div>
  );
}

const stepperButton =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-border-default bg-surface-elevated text-text-secondary transition-colors active:scale-95 disabled:opacity-40 disabled:active:scale-100";

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
  productsLoading,
  productsError,
  onRetryProducts,
  onSellItemsChanged,
  shiftReady,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  session: SessionRow | null;
  frozenAt: string | null;
  products: Product[];
  productsLoading: boolean;
  productsError: string;
  onRetryProducts: () => void;
  onSellItemsChanged: () => Promise<boolean>;
  shiftReady: boolean;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onClose: () => void;
  onDone: () => Promise<boolean | void>;
}) {
  const { success: notifySuccess, error: notifyError } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [playQuote, setPlayQuote] = useState<PlayTimeQuote | null>(null);
  // Tham số mà quote server hiện tại tương ứng — dùng để biết quote còn khớp
  // với lựa chọn đang hiển thị hay không (thay vì xoá trắng số khi tính lại).
  const [quoteKey, setQuoteKey] = useState("");
  const [promotions, setPromotions] = useState<PromotionSnapshot[]>([]);
  const [promotionRuleId, setPromotionRuleId] = useState("");
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotionsError, setPromotionsError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [parkingVehicleCount, setParkingVehicleCount] = useState(0);
  // Bảng giá hiệu lực — chỉ cần cho session chưa gán giá (fresh walk-in)
  const [applicablePricingRules, setApplicablePricingRules] = useState<
    PricingRuleOption[]
  >([]);
  // Luồng chọn người + bảng giá thống nhất
  const [pickerGroups, setPickerGroups] = useState<PickerGroup[]>([]);
  const nextGroupKey = useRef(0);
  const lastPreviewSessionId = useRef<string | null>(null);
  // Dòng bán kèm đang gọi API bỏ khỏi phiên
  const [removingSellItemId, setRemovingSellItemId] = useState("");
  const [quoteReloadKey, setQuoteReloadKey] = useState(0);

  const isMember =
    session?.customer?.type === "MEMBER" || !!session?.membership;
  const sessionPlayerCount = session?.playerCount ?? 1;

  // Session check-in mới (để trống giá) — cần chọn bảng giá khi thu tiền
  const needsPricing =
    !!session &&
    !isMember &&
    (session.pricingGroups?.length ?? 0) > 0 &&
    session.pricingGroups!.every(
      (g) => !g.pricingSnapshot && Number(g.hourlyRate) === 0,
    );
  // Mọi phiên đều có player rows (kể cả phiên 1 người — check-in luôn tạo row),
  // nên vãng lai luôn thu qua picker.
  const pickerActive = !!session && !isMember;

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
    () => new Set(pickerGroups.flatMap((g) => g.selectedIds)).size,
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
      setApplicablePricingRules([]);
      setPickerGroups([]);
      nextGroupKey.current = 0;
      setRemovingSellItemId("");

      if (!isMember && !needsPricing) {
        // ── Phiên đã gán giá: build nhóm cố định từ pricing groups ──
        // Mỗi nhóm còn người chưa thu = 1 nhóm; mặc định chọn tất cả (thu hết).
        // Phiên chưa gán giá để nhóm trống — effect tải bảng giá bên dưới dựng
        // nhóm chưa khoá từ toàn bộ người chơi.
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
              members: unchecked.map((p) => ({ id: p.id, name: p.name ?? null })),
              selectedIds: unchecked.map((p) => p.id),
            };
          });
        setPickerGroups(groups);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [session, isMember, needsPricing]);

  // Fetch bảng giá hiệu lực khi mở drawer với session cần gán giá (fresh walk-in)
  useEffect(() => {
    if (!session || !needsPricing || !pickerActive) return;
    let cancelled = false;
    const allPlayers = (session.pricingGroups ?? [])
      .flatMap((g) => g.players ?? [])
      .filter((p) => !p.checkedOutAt);
    const allPlayerIds = allPlayers.map((p) => p.id);
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
                    members: allPlayers.map((p) => ({
                      id: p.id,
                      name: p.name ?? null,
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
  // pricingGroupId+playerCount, subset/nhiều nhóm → playerIds.
  const buildPricingParams = useCallback(() => {
    if (!session) return null;
    if (!pickerActive) return {};
    if (needsPricing) {
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
  }, [session, pickerActive, needsPricing, pickerGroups]);

  // Khoá tham số của lần preview hiện tại — quote server chỉ được coi là "tươi"
  // khi khoá khớp. Đổi lựa chọn (người chơi, bảng giá, khuyến mại) là khoá đổi.
  const quoteRequestKey = useMemo(
    () =>
      !session
        ? ""
        : [
            session.id,
            promotionRuleId,
            frozenAt ?? "",
            JSON.stringify(buildPricingParams() ?? null),
            quoteReloadKey,
          ].join("|"),
    [session, promotionRuleId, frozenAt, buildPricingParams, quoteReloadKey],
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!session) {
      setPlayQuote(null);
      setQuoteError("");
      lastPreviewSessionId.current = null;
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const delay = lastPreviewSessionId.current === session.id ? 250 : 0;
    lastPreviewSessionId.current = session.id;
    setQuoteLoading(true);
    setQuoteError("");
    const loadQuote = async () => {
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
          { signal: controller.signal },
        );
        if (!data.success || !data.data) {
          throw new Error(data.error || "Không tính được tiền giờ chơi");
        }
        if (!cancelled) {
          setPlayQuote(data.data);
          setQuoteKey(quoteRequestKey);
        }
      } catch (quoteLoadError) {
        if (!cancelled && !controller.signal.aborted)
          setQuoteError(
            (quoteLoadError as Error).message ||
              "Không tính được tiền giờ chơi",
          );
      } finally {
        if (!cancelled && !controller.signal.aborted) setQuoteLoading(false);
      }
    };

    const timer = window.setTimeout(() => void loadQuote(), delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    session,
    promotionRuleId,
    frozenAt,
    buildPricingParams,
    quoteReloadKey,
    quoteRequestKey,
  ]);

  // ── Precalc tiền giờ chơi tại client ─────────────────────
  // Session row đã mang sẵn snapshot bảng giá + pause từng người, đúng bằng đầu
  // vào của pure function server dùng — nên tiền hiện tức thì thay vì chờ
  // /checkout-preview (7 round trip). Chỉ chạy khi đã chốt thời điểm thu: lúc đó
  // kết quả khớp quote server và không nhảy số theo đồng hồ. Server ghi đè khi về.
  const localQuote = useMemo<PlayTimeQuote | null>(() => {
    if (!session || !frozenAt || isMember) return null;
    const endTime = new Date(frozenAt);

    const promotion = promotionRuleId
      ? (promotions.find((p) => p.ruleId === promotionRuleId) ?? null)
      : null;
    // Đã chọn khuyến mại nhưng chưa có snapshot → không đoán bừa, chờ server
    if (promotionRuleId && !promotion) return null;

    const ruleOfGroup = (groupId: string): PrecalcRule | null => {
      const snapshot = (session.pricingGroups ?? []).find(
        (g) => g.id === groupId,
      )?.pricingSnapshot;
      return snapshot
        ? {
            name: snapshot.name,
            ratePerHour: snapshot.ratePerHour,
            tiers: snapshot.tiers,
          }
        : null;
    };
    const entryById = new Map(
      (session.pricingGroups ?? []).flatMap((g) =>
        (g.players ?? []).map((p) => [p.id, p] as const),
      ),
    );
    const toPlayer = (id: string, rule: PrecalcRule): PrecalcPlayer | null => {
      const player = entryById.get(id);
      if (!player || player.checkedOutAt) return null;
      return {
        id,
        name: player.name,
        pausedAt: player.pausedAt,
        totalPausedSeconds: player.totalPausedSeconds,
        rule,
      };
    };

    const players: PrecalcPlayer[] = [];
    for (const group of pickerGroups) {
      if (group.selectedIds.length === 0) continue;
      // Phiên chưa gán giá: bảng giá chọn trong picker. Đã gán giá: snapshot của group.
      const rule = needsPricing
        ? (applicablePricingRules.find((r) => r.id === group.pricingRuleId) ?? null)
        : ruleOfGroup(group.key);
      if (!rule) return null;
      for (const id of group.selectedIds) {
        const player = toPlayer(id, rule);
        if (!player) return null;
        players.push(player);
      }
    }

    const result = precalcPlayTime({
      startTime: session.startTime,
      endTime: frozenAt,
      promotion,
      players,
      sessionPause: {
        pausedAt: session.pausedAt ?? null,
        totalPausedSeconds: session.totalPausedSeconds ?? 0,
      },
    });
    if (!result) return null;

    return {
      sessionId: session.id,
      hourlyRate: 0,
      isMemberSession: false,
      promotion,
      // Dòng bán kèm + đơn giá gửi xe chỉ server biết — giữ giá trị gần nhất
      pendingSellTotal: playQuote?.pendingSellTotal ?? 0,
      pendingSellItems: playQuote?.pendingSellItems ?? [],
      parkingFeeUnitPrice: playQuote?.parkingFeeUnitPrice,
      pricingGroups: (session.pricingGroups ?? []).map((g) => ({
        ...g,
        pausedSeconds: groupPausedSeconds({ players: g.players ?? [] }, endTime),
      })),
      ...result,
    };
  }, [
    session,
    frozenAt,
    isMember,
    promotionRuleId,
    promotions,
    pickerGroups,
    needsPricing,
    applicablePricingRules,
    playQuote,
  ]);

  // Quote server chỉ "tươi" khi đúng tham số đang hiển thị. Khi chưa tươi: dùng
  // số precalc (đúng tham số mới), không có thì giữ số server gần nhất — thay vì
  // xoá trắng ô tiền mỗi lần tích/bỏ một người chơi.
  const quoteFresh = !!playQuote && quoteKey === quoteRequestKey;
  const displayQuote = quoteError
    ? null
    : quoteFresh
      ? playQuote
      : (localQuote ?? playQuote);
  // Đang hiển thị số chưa được server xác nhận (precalc hoặc quote cũ giữ lại):
  // vẫn cho thấy số để không trắng ô, nhưng làm mờ + banner để không đọc như số chốt.
  const quotePending = !!displayQuote && !quoteFresh;

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

  // ── Đồng hồ tick mỗi giây khi chưa chốt thời điểm thu (frozenAt null) ──
  // Giúp tính thời gian chơi/tạm dừng theo từng người mà không gọi Date.now()
  // trực tiếp trong render.
  const [nowTick, setNowTick] = useState<number | null>(null)

  useEffect(() => {
    if (!session || frozenAt) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setNowTick(Date.now())
    const timer = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(timer)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [session, frozenAt])

  // ── Tiền + thời gian từng người chơi cho bảng ──
  const memberStats = useMemo(() => {
    const stats: Record<string, PickerMemberStat> = {};
    if (!session) return stats;
    const endMs = frozenAt ? new Date(frozenAt).getTime() : (nowTick ?? new Date(session.startTime).getTime());
    const elapsedTotal = Math.max(
      0,
      Math.floor((endMs - new Date(session.startTime).getTime()) / 1000),
    );
    const pricedById = new Map(
      (displayQuote?.playerPricing ?? []).map((p) => [p.id, p]),
    );
    for (const group of session.pricingGroups ?? []) {
      for (const player of group.players ?? []) {
        if (player.checkedOutAt) continue;
        const pausedSeconds = pausedSecondsUntil(
          player.pausedAt,
          player.totalPausedSeconds ?? 0,
          endMs,
        );
        const priced = pricedById.get(player.id);
        stats[player.id] = {
          // Giá niêm yết từng người — khuyến mại nằm ở một dòng riêng của liên 2
          amount: priced ? priced.subtotal : null,
          playedText: hhmm(
            priced
              ? Math.round(priced.totalHours * 3600)
              : Math.max(0, elapsedTotal - pausedSeconds),
            ),
          pausedText: hhmm(pausedSeconds),
        };
      }
    }
    return stats;
  }, [session, displayQuote, frozenAt, nowTick]);

  // Thời gian đã tạm dừng hiển thị khi checkout:
  // - Phiên có player rows → pause nằm ở từng người chơi; chỉ tính các player
  //   được thu lần này (đúng lựa chọn picker), chốt theo frozenAt.
  // - Phiên hội viên (không thu qua picker) → pause session-level.
  const displayPausedSeconds = useMemo(() => {
    if (!session) return 0;
    const pausedAtRef = frozenAt ? new Date(frozenAt).getTime() : undefined;
    const billingIds = pickerActive
      ? new Set(pickerGroups.flatMap((g) => g.selectedIds))
      : null;
    if (displayQuote?.pricingGroups) {
      return displayQuote.pricingGroups.reduce(
        (sum, g) =>
          sum +
          (g.players ?? [])
            .filter(
              (p) => !p.checkedOutAt && (!billingIds || billingIds.has(p.id)),
            )
            .reduce(
              (s, p) =>
                s +
                pausedSecondsUntil(
                  p.pausedAt,
                  p.totalPausedSeconds ?? 0,
                  pausedAtRef,
                ),
              0,
            ),
        0,
      );
    }
    return pausedSecondsUntil(
      session.pausedAt,
      session.totalPausedSeconds ?? 0,
      pausedAtRef,
    );
  }, [session, displayQuote, frozenAt, pickerActive, pickerGroups]);

  const playTimeText = session
    ? calcElapsedHMS(
        session.startTime,
        frozenAt ?? undefined,
        displayPausedSeconds,
      )
    : "00:00:00";

  const cartLines = products
    .map((product) => ({
      product,
      quantity: cart[product.id] ?? 0,
      total: (cart[product.id] ?? 0) * toNumber(product.price),
    }))
    .filter((line) => line.quantity > 0);
  const cartEditorLines: InvoiceEditorLine[] = cartLines.map((line) => ({
    productId: line.product.id,
    name: line.product.name,
    type: line.product.type,
    stockQuantity: line.product.stockQuantity,
    quantity: line.quantity,
    unitPrice: toNumber(line.product.price),
  }));

  const productSubtotal = cartLines.reduce((sum, line) => sum + line.total, 0);
  const pendingSellItems = useMemo(
    () => displayQuote?.pendingSellItems ?? [],
    [displayQuote],
  );
  // Toàn bộ dòng bán kèm chờ thu sẽ được gộp vào hoá đơn khi checkout
  const pendingSellTotal = useMemo(
    () => pendingSellItems.reduce((sum, item) => sum + item.subtotal, 0),
    [pendingSellItems],
  );
  const parkingFeeUnitPrice = displayQuote?.parkingFeeUnitPrice ?? 0;
  const parkingFeeTotal = parkingVehicleCount * parkingFeeUnitPrice;

  // ── Chuỗi số của phiếu: Tạm tính → Tổng → Cần thu ──
  const playGross = displayQuote?.subtotal ?? 0;
  const playDiscount = displayQuote?.discountAmount ?? 0;
  const depositRemaining = Math.max(
    0,
    Number(session?.booking?.depositAmount ?? 0) -
      Number(session?.booking?.depositAppliedAmount ?? 0) -
      Number(session?.booking?.depositRefundedAmount ?? 0),
  );
  const totals = checkoutTotals({
    playGross,
    itemsTotal: pendingSellTotal + productSubtotal,
    discount: playDiscount,
    parkingTotal: parkingFeeTotal,
    depositRemaining,
  });

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

  /** Bỏ 1 dòng bán kèm khỏi phiên (hoàn kho) rồi tính lại preview */
  const removeSellItem = async (sessionSellItemId: string) => {
    if (!session) return;
    setRemovingSellItemId(sessionSellItemId);
    try {
      const data = await apiJson(
        `/api/sessions/${session.id}/sell-items`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: [sessionSellItemId] }),
        },
      );
      if (!data.success) {
        notifyError(data.error || "Không bỏ được dòng bán kèm");
        return;
      }
      const refreshed = await onSellItemsChanged();
      if (!refreshed) {
        notifyError("Đã bỏ dòng bán kèm nhưng danh sách chưa cập nhật. Không thao tác lại; hãy tải lại màn hình.");
      }
      setQuoteReloadKey((k) => k + 1);
    } catch {
      notifyError("Lỗi kết nối máy chủ");
    } finally {
      setRemovingSellItemId("");
    }
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
      const data = await apiJson<CheckoutResponse>(
        `/api/sessions/${session.id}/checkout`,
        jsonRequest(body),
      );

      if (!data.success) {
        notifyError(data.error || "Không checkout được");
        return;
      }

      const refreshed = await onDone();
      notifySuccess(refreshed === false
        ? "Đã ghi nhận thanh toán; dữ liệu chưa cập nhật. Không thu lại, hãy tải lại màn hình."
        : `Đã thu ${billMoney(data.data?.grandTotal ?? totals.payable)}`);
    } catch {
      notifyError("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  const getCtaLabel = () => {
    if (!pickerActive) return "Thu tiền & kết thúc";
    // Cọc đã phủ hết hoá đơn: không còn gì để thu, nút chỉ chốt phiên
    if (totals.payable === 0 && totals.depositApplied > 0)
      return "Kết thúc (đã trừ cọc)";
    if (isPartialBySelection) return `Thu trước ${selectedCount} người`;
    if (uncheckedTotal === 1) return "Thu tiền & kết thúc";
    return `Thu tiền ${selectedCount} người`;
  };

  return (
    <Modal
      open={!!session}
      onClose={onClose}
      variant="fullscreen"
      title={
        session
          ? `Chi tiết hoá đơn - ${session.customerName ?? session.customer?.fullName ?? "Khách lẻ"}`
          : "Chi tiết hoá đơn"
      }
      description={
        session ? (
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isMember
                  ? "bg-yellow-bg text-yellow-dark"
                  : "bg-info-bg text-info"
              }`}
            >
              {isMember ? "Hội viên" : "Vãng lai"}
            </span>
            <span>
              Vào chơi {new Date(session.startTime).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {session.customerPhone && (
              <span>
                <a
                  href={`tel:${session.customerPhone}`}
                  className="font-medium text-success underline-offset-2 hover:underline"
                >
                  {session.customerPhone}
                </a>
              </span>
            )}
            {sessionPlayerCount > 1 && <span>{sessionPlayerCount} người chơi</span>}
          </span>
        ) : undefined
      }
      size="lg"
      footer={
        <div className="space-y-3">
          {/* Lý do chưa thu được */}
          {quoteLoading ? (
            <p className="flex items-center gap-2 rounded-lg bg-surface-tertiary px-4 py-2 text-xs text-text-tertiary">
              <Loader2 size={14} className="animate-spin" />
              {playQuote
                ? "Đang tính lại tiền giờ chơi..."
                : "Đang tính tiền giờ chơi..."}
            </p>
          ) : quoteError ? (
            <p className="rounded-lg border border-danger-border bg-danger-bg px-4 py-2 text-xs text-danger">
              {quoteError}
            </p>
          ) : pricingBlocked ? (
            <p className="rounded-lg border border-danger-border bg-danger-bg px-4 py-2 text-xs text-danger">
              Chưa có bảng giá hiệu lực — chưa thể thu tiền.
            </p>
          ) : !shiftReady ? (
            <p className="rounded-lg border border-warning-border bg-warning-bg px-4 py-2 text-xs text-warning">
              Cần mở ca trước khi thu tiền.
            </p>
          ) : freshMultiGroupPartial ? (
            <p className="rounded-lg border border-danger-border bg-danger-bg px-4 py-2 text-xs text-danger">
              Thu trước chỉ hỗ trợ 1 nhóm — gộp về 1 nhóm hoặc thu hết.
            </p>
          ) : pickerActive && !hasAssignedPlayers ? (
            <p className="rounded-lg border border-warning-border bg-warning-bg px-4 py-2 text-xs text-warning">
              Chọn ít nhất 1 người chơi trước khi thu tiền.
            </p>
          ) : null}
          <div className="flex items-end justify-between gap-3">
            <span className="text-sm font-medium text-text-secondary">
              Cần thu
            </span>
            <span
              className={`text-right text-2xl font-bold leading-none tabular-nums text-text-primary ${
                quotePending ? "opacity-60" : ""
              }`}
            >
              {quoteError ? "—" : billMoney(totals.payable)}
            </span>
          </div>
          <Button
            variant="contrast"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={
              !shiftReady ||
              quoteLoading ||
              !!quoteError ||
              (!!productsError && Object.values(cart).some((quantity) => quantity > 0)) ||
              !displayQuote ||
              pricingBlocked ||
              freshMultiGroupPartial ||
              (pickerActive && !hasAssignedPlayers)
            }
            onClick={handleCheckout}
          >
            {getCtaLabel()}
          </Button>
        </div>
      }
    >
      {session && (
        <div className="space-y-6">
          {/* ══ LIÊN 1 — TÍNH TIỀN: đang tính cái gì ══ */}
          <section>
            <h3 className={GROUP_LABEL}>Liên 1 · Tính tiền</h3>

            {pricingBlocked ? (
              <p className="mt-2 rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
                Chưa có bảng giá hiệu lực — không thể thu tiền giờ chơi.
              </p>
            ) : pickerActive ? (
              <div className="mt-2">
                <CheckoutPlayerPicker
                  groups={pickerGroups}
                  rules={applicablePricingRules}
                  memberStats={memberStats}
                  onChange={setPickerGroups}
                />
                {isPartialBySelection && (
                  <p className="mt-2 text-xs text-warning">
                    Thu trước{" "}
                    <span className="font-semibold tabular-nums text-text-primary">
                      {selectedCount}
                    </span>
                    /{uncheckedTotal} người — người chưa thu tiếp tục chơi.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-2 border-y border-border-default">
                <LedgerRow
                  label={isMember ? "Giờ chơi hội viên" : "Giờ chơi"}
                  meta={`chơi ${playTimeText} · nghỉ ${formatPausedHMS(
                    displayPausedSeconds,
                  )}`}
                  amount={isMember ? "Miễn phí" : billMoney(playGross)}
                  dimmed={quotePending}
                />
              </div>
            )}

            {/* Hàng hoá / dịch vụ — dòng đã thêm vào phiên */}
            {pendingSellItems.length > 0 ? (
              <ul className="mt-2 border-t border-border-default">
                {pendingSellItems.map((item) => (
                  <li
                    key={item.sessionSellItemId}
                    className="border-b border-border-default"
                  >
                    <LedgerRow
                      label={item.productName}
                      meta={`Số lượng ${item.quantity} · đã thêm vào phiên`}
                      amount={billMoney(item.subtotal)}
                      busy={removingSellItemId === item.sessionSellItemId}
                      dimmed={quotePending}
                      onUncheck={() => void removeSellItem(item.sessionSellItemId)}
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            <InlineProductEditor
              lines={cartEditorLines}
              products={products.filter(
                (product) => product.type === "SERVICE" || product.stockQuantity > 0,
              )}
              loading={productsLoading}
              error={productsError}
              onRetry={onRetryProducts}
              onAdd={(product) => changeCart(product, 1)}
              onDecrease={(productId) => {
                const product = products.find((item) => item.id === productId);
                if (product) changeCart(product, -1);
              }}
              onIncrease={(productId) => {
                const product = products.find((item) => item.id === productId);
                if (product) changeCart(product, 1);
              }}
              onRemove={(productId) =>
                setCart((current) => {
                  const next = { ...current };
                  delete next[productId];
                  return next;
                })
              }
            />

            <div className="mt-3">
              <TotalRow
                label="Tạm tính"
                amount={billMoney(totals.charges)}
                dimmed={quotePending}
              />
            </div>
          </section>

          {/* ══ LIÊN 2 — THU TIỀN: giảm gì, thu thế nào ══
              Liên 2 nằm trên bước tint (tờ giấy than của phiếu hai liên), chạy
              tới tận chân phiếu nên liên 2 + chân phiếu đọc như một tờ. Đường
              gấp là 24px giấy trắng cộng một hairline: chỉ riêng bước
              surface-secondary thì ở màn 1x quá mờ để đọc ra hai tờ. Dùng bước
              surface-secondary (không phải tertiary) để mọi cỡ chữ nhỏ trên dải
              vẫn đạt 4.5:1. */}
          <section className="-mx-4 -mb-3 border-t border-border-default bg-surface-secondary px-4 pb-3 pt-3 sm:-mx-5 sm:-mb-4 sm:px-5 sm:pb-4">
            <h3 className={GROUP_LABEL}>Liên 2 · Thu tiền</h3>

            {!isMember &&
              (promotions.length > 0 || !!promotionRuleId || !!promotionsError) && (
              <AdjustRow
                label="Khuyến mại giờ chơi"
                amount={
                  playDiscount > 0 ? `-${billMoney(playDiscount)}` : "—"
                }
                tone={playDiscount > 0 ? "minus" : "muted"}
                dimmed={quotePending}
                control={
                  <>
                    <Select
                      id="checkout-promotion"
                      aria-label="Khuyến mại giờ chơi"
                      value={promotionRuleId}
                      disabled={promotionsLoading}
                      onChange={(event) =>
                        setPromotionRuleId(event.target.value)
                      }
                    >
                      <option value="">Không áp dụng khuyến mại</option>
                      {promotions.map((promotion) => (
                        <option key={promotion.ruleId} value={promotion.ruleId}>
                          {formatPromotionOption(promotion)}
                        </option>
                      ))}
                    </Select>
                    {promotionsError ? (
                      <p className="mt-1 text-xs text-danger">
                        {promotionsError}
                      </p>
                    ) : null}
                  </>
                }
              />
            )}

            {/* Phí gửi xe áp cho cả hội viên — server không chặn theo hạng khách */}
            {parkingFeeUnitPrice > 0 && (
              <AdjustRow
                label="Phí gửi xe"
                hint={`${billMoney(parkingFeeUnitPrice)}/xe`}
                amount={parkingFeeTotal > 0 ? `-${billMoney(parkingFeeTotal)}` : "—"}
                tone={parkingFeeTotal > 0 ? "minus" : "muted"}
                control={
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setParkingVehicleCount((c) => Math.max(0, c - 1))
                      }
                      disabled={parkingVehicleCount === 0}
                      aria-label="Giảm số xe"
                      className={stepperButton}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums text-text-primary">
                      {parkingVehicleCount}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setParkingVehicleCount((c) => Math.min(20, c + 1))
                      }
                      aria-label="Tăng số xe"
                      className={stepperButton}
                    >
                      <Plus size={14} />
                    </button>
                    <span className="text-xs text-text-tertiary">xe</span>
                  </div>
                }
              />
            )}

            <TotalRow
              label="Tổng"
              amount={billMoney(totals.total)}
              dimmed={quotePending}
              emphasis="final"
            />

            {totals.depositApplied > 0 && (
              <AdjustRow
                label="Tiền cọc"
                hint="đã thu khi đặt lịch"
                amount={`-${billMoney(totals.depositApplied)}`}
                tone="minus"
              />
            )}

            <div className="mt-4">
              <PaymentMethodPicker
                key={session.id}
                id="payment-method"
                amount={totals.payable}
                method={paymentMethod}
                onMethodChange={setPaymentMethod}
                label="Phương thức thanh toán"
              />
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}

/** Tổng giây → hh:mm (dùng cho cột thời gian trong bảng người chơi) */
function hhmm(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h, m].map((v) => v.toString().padStart(2, "0")).join(":");
}
