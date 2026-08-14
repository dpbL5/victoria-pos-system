// ── Session validation schemas ─────────────────────────
import { z } from "zod";

export const createSessionSchema = z.object({
  customerId: z.string().uuid("ID khách hàng không hợp lệ").optional(),
  customerName: z.string().trim().min(1, "Tên khách không được trống").max(100, "Tên khách tối đa 100 ký tự").optional(),
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
  items: z.array(z.object({
    productId: z.string().uuid("ID sản phẩm không hợp lệ"),
    quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
  })).default([]),
  pricingGroupId: z.string().uuid("ID nhóm giá không hợp lệ").optional(),
  playerCount: z.number().int().min(1, "Số người checkout tối thiểu là 1").optional(),
  parkingVehicleCount: z.number().int().min(0, "Số xe tối thiểu là 0").default(0).optional(),
  // Bảng giá chọn tại checkout cho khách vãng lai (session chưa gán giá lúc check-in)
  pricingRuleId: z.string().uuid("ID bảng giá không hợp lệ").optional(),
  groups: z.array(checkoutPricingGroupSchema).min(1).optional(),
  // Thu trước: chọn người chơi cụ thể (ở bất kỳ nhóm nào) để checkout — loại trừ với groups/pricingGroupId
  playerIds: z.array(z.string().uuid("ID người chơi không hợp lệ")).min(1, "Chọn ít nhất 1 người chơi").optional(),
  // DRAFT invoices (lần bán kèm) được chọn thu trong lần checkout này — không gửi = gộp toàn bộ (tương thích cũ)
  draftInvoiceIds: z.array(z.string().uuid("ID hóa đơn bán kèm không hợp lệ")).optional(),
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
