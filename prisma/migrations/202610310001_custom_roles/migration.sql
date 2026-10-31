BEGIN;

-- ── Hệ thống vai trò tuỳ chỉnh (kiểu Discord) ──────────────────────────────
-- Chỉ giữ role hệ thống ADMIN; các role còn lại do admin tự tạo qua /roles.
-- User MANAGER/STAFF/TEACHER cũ → role_id NULL ("Chưa phân vai").

CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission")
);

CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Role hệ thống duy nhất
INSERT INTO "roles" ("id", "key", "name", "locked", "updated_at")
VALUES (gen_random_uuid()::text, 'ADMIN', 'Quản trị viên', true, CURRENT_TIMESTAMP);

-- Thay cột enum role bằng role_id
ALTER TABLE "users" ADD COLUMN "role_id" TEXT;

-- ADMIN cũ → role ADMIN; còn lại → NULL ("Chưa phân vai")
UPDATE "users"
SET "role_id" = (SELECT "id" FROM "roles" WHERE "key" = 'ADMIN')
WHERE "role" = 'ADMIN';

ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users" DROP COLUMN "role";
DROP TYPE "UserRole";

COMMIT;
