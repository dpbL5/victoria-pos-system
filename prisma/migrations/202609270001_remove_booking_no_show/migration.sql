BEGIN;

SET LOCAL search_path TO "app";

UPDATE "bookings" SET "status" = 'CANCELLED' WHERE "status" = 'NO_SHOW';

ALTER TYPE "BookingStatus" RENAME TO "BookingStatus_old";
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CHECKED_IN', 'CANCELLED');
ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "bookings" ALTER COLUMN "status" TYPE "BookingStatus" USING ("status"::text::"BookingStatus");
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'BOOKED';
DROP TYPE "BookingStatus_old";

COMMIT;
