BEGIN;

CREATE TABLE "lesson_class_students" (
  "class_id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  CONSTRAINT "lesson_class_students_pkey" PRIMARY KEY ("class_id", "student_id")
);

CREATE INDEX "lesson_class_students_student_id_idx" ON "lesson_class_students"("student_id");

ALTER TABLE "lesson_class_students"
  ADD CONSTRAINT "lesson_class_students_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "lesson_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lesson_class_students"
  ADD CONSTRAINT "lesson_class_students_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "lesson_class_students" ("class_id", "student_id")
SELECT DISTINCT series."class_id", member."student_id"
FROM "lesson_series_students" AS member
JOIN "lesson_series" AS series ON series."id" = member."series_id"
WHERE series."class_id" IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
