// ── Auth validation schemas ─────────────────────────────
import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(3, "Tên đăng nhập ít nhất 3 ký tự").max(50, "Tên đăng nhập tối đa 50 ký tự"),
  password: z.string().min(6, "Mật khẩu ít nhất 6 ký tự").max(100, "Mật khẩu tối đa 100 ký tự"),
});

export const createUserSchema = z.object({
  username: z.string().min(3, "Tên đăng nhập ít nhất 3 ký tự").max(50, "Tên đăng nhập tối đa 50 ký tự"),
  password: z.string().min(6, "Mật khẩu ít nhất 6 ký tự").max(100, "Mật khẩu tối đa 100 ký tự"),
  fullName: z.string().min(1, "Họ tên không được để trống").max(100, "Họ tên tối đa 100 ký tự"),
  role: z.enum(["ADMIN", "STAFF"]),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(1, 'Họ tên không được để trống').max(100).optional(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
