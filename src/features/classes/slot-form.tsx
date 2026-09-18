'use client'
import { formatVnDate, formatVnDateTime } from '@/lib/shared/utils'
import { formatSchedule } from '@/features/students/schedule-fields'
import type { ClassSlot } from './types'

export const todayInput = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)

/** Mô tả khung giờ của lớp — dùng chung định dạng với lịch lặp bên Lịch học. */
export const formatSlot = (slot: Pick<ClassSlot, 'daysOfWeek' | 'startTime' | 'durationMin' | 'intervalWeeks' | 'occurrenceCount'>) => formatSchedule(slot)

export const formatDate = (value: string | null) => value ? formatVnDate(value) : '—'

export const formatDateTime = (value: string) => formatVnDateTime(value)
