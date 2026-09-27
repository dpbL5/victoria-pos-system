BEGIN;

ALTER TABLE "lesson_students"
  DROP CONSTRAINT IF EXISTS "lesson_students_package_id_fkey",
  DROP COLUMN IF EXISTS "package_id";

DROP TABLE IF EXISTS "lesson_packages";

COMMIT;
