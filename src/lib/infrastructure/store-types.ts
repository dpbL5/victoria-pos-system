// ── Store types — structural types, cả PrismaClient lẫn TransactionClient đều thỏa mãn ─────
import type { Prisma } from '@/generated/prisma/client'

export type ShiftStore = Pick<Prisma.TransactionClient, 'shift' | 'shiftParticipant' | 'shiftTool'>
export type PaymentStore = Pick<Prisma.TransactionClient, 'payment' | 'membershipPayment'>
export type MembershipStore = Pick<Prisma.TransactionClient, 'membership' | 'membershipPlan'>
export type CustomerStore = Pick<Prisma.TransactionClient, 'customer'>
export type BillingStore = Pick<Prisma.TransactionClient, 'invoice' | 'invoiceItem' | 'payment' | 'membershipPayment' | 'stockMovement'>
export type SessionStore = Pick<Prisma.TransactionClient, 'session' | 'sessionPricingGroup' | 'invoice'>
export type ProductStore = Pick<Prisma.TransactionClient, 'product' | 'stockMovement'>
export type PricingStore = Pick<Prisma.TransactionClient, 'pricingRule' | 'pricingTier'>
export type PromotionStore = Pick<Prisma.TransactionClient, 'promotionRule'>
export type SettingsStore = Pick<Prisma.TransactionClient, 'appSetting'>
export type CashflowStore = Pick<Prisma.TransactionClient, 'cashflowEntry'>
export type AuditStore = Pick<Prisma.TransactionClient, 'activityLog'>
