BEGIN;

CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW');
ALTER TYPE "PaymentKind" ADD VALUE 'DEPOSIT';
ALTER TYPE "InvoiceItemType" ADD VALUE 'DEPOSIT';
ALTER TYPE "InvoiceItemType" ADD VALUE 'DEPOSIT_APPLIED';

CREATE TABLE "bookings" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT,
  "customer_name" VARCHAR(100),
  "customer_phone" VARCHAR(20),
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "player_count" INTEGER NOT NULL DEFAULT 1,
  "deposit_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
  "deposit_applied_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
  "deposit_refunded_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
  "deposit_payment_method" "PaymentMethod",
  "deposit_invoice_id" TEXT,
  "deposit_refund_invoice_id" TEXT,
  "session_id" TEXT,
  "staff_id" TEXT NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bookings_deposit_invoice_id_key" ON "bookings"("deposit_invoice_id");
CREATE UNIQUE INDEX "bookings_deposit_refund_invoice_id_key" ON "bookings"("deposit_refund_invoice_id");
CREATE UNIQUE INDEX "bookings_session_id_key" ON "bookings"("session_id");
CREATE INDEX "bookings_scheduled_at_status_idx" ON "bookings"("scheduled_at", "status");
CREATE INDEX "bookings_customer_id_status_idx" ON "bookings"("customer_id", "status");

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_deposit_invoice_id_fkey"
  FOREIGN KEY ("deposit_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_deposit_refund_invoice_id_fkey"
  FOREIGN KEY ("deposit_refund_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
