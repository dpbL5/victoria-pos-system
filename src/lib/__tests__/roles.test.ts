import { describe, expect, it } from 'vitest'
import { canAccessTraining, getRoleLabel } from '@/lib/shared/roles'

describe('role access', () => {
 it('limits training access to admin and teacher', () => {
 expect(canAccessTraining('ADMIN')).toBe(true)
 expect(canAccessTraining('TEACHER')).toBe(true)
 expect(canAccessTraining('MANAGER')).toBe(false)
 expect(canAccessTraining('STAFF')).toBe(false)
 })

 it('labels teacher accounts in Vietnamese', () => {
 expect(getRoleLabel('TEACHER')).toBe('Giáo viên')
 })
})
