// ── Session validation schemas ─────────────────────────
import { z } from "zod";

export const createSessionSchema = z.object({
  customerId: z.string().uuid("ID khách hàng không hợp lệ").optional(),
  customerName: z.string().trim().min(1, "Tên khách không được trống").max(100, "Tên khách tối đa 100 ký tự").optional(),
  customerPhone: z.string().trim().regex(/^\d{9,11}$/, "SĐT không hợp lệ (9-11 chữ số)").optional(),
  playerCount: z.number().int().min(1, "Số người chơi tối thiểu là 1").max(50, "Số người chơi tối đa là 50").default(1),
  startTime: z.string().datetime().optional(),
});

const checkoutPricingGroupSchema = z.object({
  playerCount: z.number().int().min(1, "Mỗi nhóm tối thiểu 1 người"),
  pricingRuleId: z.string().uuid("ID bảng giá không hợp lệ"),
  playerIds: z.array(z.string().uuid("ID người chơi không hợp lệ")).min(1, "Mỗi nhóm phải chọn ít nhất 1 người chơi"),
});

export const checkoutSessionSchema = z.object({
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD'], {
    message: 'Phương thức thanh toán không hợp lệ',
  }),
  promotionRuleId: z.string().uuid("ID khuyến mại không hợp lệ").nullable().optional(),
  endTime: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
  /**
   * DANH SÁCH HÀNG CUỐI CÙNG của phiếu — gồm cả dòng đã bán kèm lúc chơi (đã sửa
   * số lượng tại chân phiếu) lẫn hàng mới chọn lúc thu.
   *
   * Phân biệt `undefined` với `[]` là cố ý:
   * - có mảng (kể cả rỗng) → checkout HOÀ GIẢI theo danh sách này: dòng bán kèm
   *   không có trong danh sách bị bỏ (hoàn kho), dòng có mặt được chỉnh về số lượng
   *   này (trừ/hoàn kho phần chênh lệch).
   * - không gửi → giữ nguyên dòng bán kèm như cũ, chỉ thêm hàng mới (client cũ).
   */
  items: z.array(z.object({
    productId: z.string().uuid("ID sản phẩm không hợp lệ"),
    quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
  })).optional(),
  pricingGroupId: z.string().uuid("ID nhóm giá không hợp lệ").optional(),
  playerCount: z.number().int().min(1, "Số người checkout tối thiểu là 1").optional(),
  parkingVehicleCount: z.number().int().min(0, "Số xe tối thiểu là 0").default(0).optional(),
  // Bảng giá chọn tại checkout cho khách vãng lai (session chưa gán giá lúc check-in)
  pricingRuleId: z.string().uuid("ID bảng giá không hợp lệ").optional(),
  groups: z.array(checkoutPricingGroupSchema).min(1).optional(),
  // Thu trước: chọn người chơi cụ thể (ở bất kỳ nhóm nào) để checkout — loại trừ với groups/pricingGroupId
  playerIds: z.array(z.string().uuid("ID người chơi không hợp lệ")).min(1, "Chọn ít nhất 1 người chơi").optional(),
  /**
   * Bảng giá cho từng nhóm CHƯA có giá khi thu trước (key = groupId) — để nhóm
   * còn chơi chọn được bảng giá riêng sau khi nhóm khác đã thu xong. Nhóm đã
   * chốt giá ở lần thu trước không gửi lại.
   */
  groupPricingRuleIds: z
    .record(z.string(), z.string().uuid("ID bảng giá không hợp lệ"))
    .optional(),
}).superRefine((data, ctx) => {
  const chosen = [data.playerIds, data.groups, data.pricingGroupId].filter(v => v !== undefined).length
  if (chosen > 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['playerIds'],
      message: 'Chỉ chọn 1 cách thu: theo người chơi, theo nhóm giá, hoặc theo số lượng',
    })
  }
});

export const updateSessionSchema = z.object({
  status: z.enum(["ACTIVE", "CANCELLED"]).optional(),
  notes: z.string().max(500).optional(),
});

// Đổi tên 1 người chơi — name rỗng cho phép xoá tên (UI fallback "Người N")
export const renamePlayerSchema = z.object({
  name: z.string().trim().max(100, "Tên người chơi tối đa 100 ký tự").optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type CheckoutSessionInput = z.infer<typeof checkoutSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
