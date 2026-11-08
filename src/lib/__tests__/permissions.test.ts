import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  filterValidPermissions,
  firstAccessibleModuleRoute,
  groupPermissionKeys,
  hasAccess,
  hasAnyPermission,
  hasPageAccess,
  hasPermission,
  isSuperuserRole,
  isValidPermission,
  moduleAccessible,
} from '@/lib/shared/permissions'

// ── Permission catalog + helpers ──────────────────────────

describe('catalog', () => {
  it('mọi khóa quyền unique', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length)
  })

  it('mọi nhóm có ít nhất một quyền và khóa nhóm unique', () => {
    expect(PERMISSION_GROUPS.length).toBeGreaterThan(10)
    const keys = PERMISSION_GROUPS.map((g) => g.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const group of PERMISSION_GROUPS) {
      expect(group.permissions.length).toBeGreaterThan(0)
    }
  })

  it('mọi khóa trong danh sách nhóm đều nằm trong ALL_PERMISSIONS', () => {
    const flat = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key))
    for (const key of flat) expect(isValidPermission(key)).toBe(true)
    expect(flat.length).toBe(ALL_PERMISSIONS.length)
  })

  it('mỗi nhóm điều hướng có route bắt đầu bằng /', () => {
    for (const group of PERMISSION_GROUPS) {
      if (group.module) expect(group.module.route).toMatch(/^\//)
    }
  })

  it('đủ các nhóm chính của hệ thống', () => {
    const keys = PERMISSION_GROUPS.map((g) => g.key)
    for (const expected of [
      'sessions', 'bookings', 'customers', 'memberships', 'products', 'stock',
      'invoices', 'pricing', 'promotions', 'tools', 'shifts', 'reports',
      'cashflows', 'users', 'roles', 'settings', 'students', 'classes', 'lessons', 'audit',
    ]) {
      expect(keys, expected).toContain(expected)
    }
  })
})

describe('hasPermission / hasAnyPermission', () => {
  const perms = ['pricing.view', 'stock.post']

  it('hasPermission khớp đúng khóa', () => {
    expect(hasPermission(perms, 'pricing.view')).toBe(true)
    expect(hasPermission(perms, 'pricing.create')).toBe(false)
  })

  it('perms null/undefined → false (Chưa phân vai)', () => {
    expect(hasPermission(null, 'sessions.view')).toBe(false)
    expect(hasPermission(undefined, 'sessions.view')).toBe(false)
    expect(hasAnyPermission(null, ['sessions.view'])).toBe(false)
  })

  it('hasAnyPermission: đủ một là đủ', () => {
    expect(hasAnyPermission(perms, ['pricing.create', 'pricing.view'])).toBe(true)
    expect(hasAnyPermission(perms, ['pricing.create'])).toBe(false)
  })
})

describe('isSuperuserRole / hasAccess', () => {
  it('ADMIN bypass, kể cả permissions rỗng', () => {
    expect(isSuperuserRole({ key: 'ADMIN' })).toBe(true)
    expect(hasAccess([], 'ADMIN', 'roles.manage')).toBe(true)
  })

  it('role thường phải có quyền', () => {
    expect(hasAccess(['inventory.view'], null, 'inventory.view')).toBe(true)
    expect(hasAccess(['inventory.view'], null, 'inventory.delete')).toBe(false)
    expect(hasAccess(null, null, 'inventory.view')).toBe(false)
  })
})

describe('moduleAccessible / hasPageAccess / firstAccessibleModuleRoute', () => {
  it('nhóm không có quyền nào → ẩn (false)', () => {
    expect(moduleAccessible(['pricing.view'], 'stock')).toBe(false)
    expect(moduleAccessible(['pricing.view'], 'pricing')).toBe(true)
  })

  it('nhóm khác prefix — đúng theo khóa nhóm', () => {
    expect(moduleAccessible(['stock.post'], 'stock')).toBe(true)
    expect(moduleAccessible(['products.view'], 'products')).toBe(true)
    expect(moduleAccessible(['products.view'], 'stock')).toBe(false)
  })

  it('ADMIN bypass mọi nhóm', () => {
    expect(moduleAccessible([], 'tools', 'ADMIN')).toBe(true)
  })

  it('hasPageAccess: any-of nhóm', () => {
    expect(hasPageAccess(['customers.view'], ['customers', 'memberships'])).toBe(true)
    expect(hasPageAccess(['memberships.view'], ['customers', 'memberships'])).toBe(true)
    expect(hasPageAccess(['memberships.register'], ['customers', 'memberships'])).toBe(true)
    expect(hasPageAccess(['pricing.view'], ['customers', 'memberships'])).toBe(false)
  })

  it('firstAccessibleModuleRoute: nhóm đầu tiên trong catalog mà user vào được', () => {
    // sessions là nhóm đầu tiên có module
    expect(firstAccessibleModuleRoute(['sessions.view'])).toBe('/sessions')
    // chỉ đào tạo → students đứng trước lessons trong catalog
    expect(firstAccessibleModuleRoute(['students.view', 'lessons.view'])).toBe('/students')
    // không có quyền module nào → undefined (layout hiển thị màn "Chưa phân vai")
    expect(firstAccessibleModuleRoute(['settings.edit'])).toBeUndefined()
    expect(firstAccessibleModuleRoute(null)).toBeUndefined()
  })

  it('firstAccessibleModuleRoute: ADMIN bypass → module đầu tiên', () => {
    expect(firstAccessibleModuleRoute([], 'ADMIN')).toBe('/sessions')
  })

  it('groupPermissionKeys: nhóm lạ → rỗng (không ném)', () => {
    expect(groupPermissionKeys('khong-ton-tai')).toEqual([])
    expect(moduleAccessible(['x'], 'khong-ton-tai')).toBe(false)
  })
})

describe('filterValidPermissions', () => {
  it('loại khóa lạ, giữ khóa hợp lệ', () => {
    expect(filterValidPermissions(['pricing.view', 'fake.key'])).toEqual(['pricing.view'])
  })
})
