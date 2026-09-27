BEGIN;

-- AlterTable
ALTER TABLE "lesson_series" ADD COLUMN     "google_calendar_id" TEXT,
ADD COLUMN     "interval_weeks" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "materialized_until" TIMESTAMP(3),
ADD COLUMN     "occurrence_count" INTEGER,
ADD COLUMN     "time_zone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "google_calendar_id" TEXT,
ADD COLUMN     "is_exception" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "original_start_at" TIMESTAMP(3),
ADD COLUMN     "share_note" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "calendar_connections" ADD COLUMN     "generation" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
ADD COLUMN     "lease_owner" TEXT,
ADD COLUMN     "lease_until" TIMESTAMP(3),
ADD COLUMN     "needs_reconnect" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "lesson_series_students" (
    "series_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,

    CONSTRAINT "lesson_series_students_pkey" PRIMARY KEY ("series_id","student_id")
);

-- CreateTable
CREATE TABLE "calendar_sync_jobs" (
    "id" TEXT NOT NULL,
    "entity_key" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "synced_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_series_students_student_id_idx" ON "lesson_series_students"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_sync_jobs_entity_key_key" ON "calendar_sync_jobs"("entity_key");

-- CreateIndex
CREATE INDEX "calendar_sync_jobs_status_next_attempt_at_idx" ON "calendar_sync_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_series_id_original_start_at_key" ON "lessons"("series_id", "original_start_at");

-- AddForeignKey
ALTER TABLE "lesson_series_students" ADD CONSTRAINT "lesson_series_students_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "lesson_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_series_students" ADD CONSTRAINT "lesson_series_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Giữ lịch cũ; chỉ suy ra occurrence chưa từng chỉnh sửa.
UPDATE lessons l SET original_start_at = l.starts_at
WHERE l.series_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM activity_logs a WHERE a.entity_type = 'Lesson' AND a.entity_id::text = l.id AND a.action = 'LESSON_UPDATE'
);

-- Nếu có buổi cũ đã sửa: điền mapping đã đối soát tại đây, trước kiểm tra dưới.
-- UPDATE lessons SET original_start_at = '2026-09-09T11:00:00Z' WHERE id = 'ID_DA_DOI_SOAT';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM lessons WHERE series_id IS NOT NULL AND original_start_at IS NULL) THEN
    RAISE EXCEPTION 'Có buổi lịch lặp đã chỉnh sửa: đối soát original_start_at với audit/Google và điền mapping trước khi chạy migration';
  END IF;
END $$;

UPDATE lessons SET is_exception = (status = 'CANCELLED' OR note IS NOT NULL OR starts_at <> original_start_at)
WHERE series_id IS NOT NULL;

INSERT INTO lesson_series_students(series_id, student_id)
SELECT DISTINCT l.series_id, ls.student_id FROM lessons l
JOIN lesson_students ls ON ls.lesson_id = l.id
WHERE l.series_id IS NOT NULL;

UPDATE lesson_series s SET materialized_until = (
  SELECT max(l.original_start_at) + interval '1 millisecond' FROM lessons l WHERE l.series_id = s.id
);

-- Dữ liệu cũ dùng primary; ghi mapping trước khi admin chọn một lịch khác.
UPDATE lessons SET google_calendar_id = COALESCE((SELECT calendar_id FROM calendar_connections WHERE id = 'single'), 'primary') WHERE google_event_id IS NOT NULL;
UPDATE lesson_series SET google_calendar_id = COALESCE((SELECT calendar_id FROM calendar_connections WHERE id = 'single'), 'primary') WHERE google_event_id IS NOT NULL;

UPDATE lesson_series SET rrule = 'RRULE:FREQ=WEEKLY;WKST=MO;INTERVAL=1;BYDAY=' ||
  (SELECT string_agg((ARRAY['SU','MO','TU','WE','TH','FR','SA'])[d + 1], ',' ORDER BY d) FROM unnest(days_of_week) d) ||
  CASE WHEN ends_on IS NULL THEN '' ELSE ';UNTIL=' || to_char(ends_on, 'YYYYMMDD"T"HH24MISS"Z"') END;

-- Chờ admin xác nhận lịch đích và kết nối lại với scope tối thiểu trước sync.
UPDATE calendar_connections SET needs_reconnect = true;
ALTER TABLE calendar_connections ALTER COLUMN generation DROP DEFAULT;
CREATE TABLE calendar_event_mappings (
  entity_key TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  PRIMARY KEY (entity_key, calendar_id)
);
INSERT INTO calendar_event_mappings SELECT 'LESSON:' || id, google_calendar_id, google_event_id FROM lessons WHERE google_event_id IS NOT NULL;
INSERT INTO calendar_event_mappings SELECT 'SERIES:' || id, google_calendar_id, google_event_id FROM lesson_series WHERE google_event_id IS NOT NULL;
COMMIT;
