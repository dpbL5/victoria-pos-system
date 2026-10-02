import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { MoreScreen } from './more-screen'

const session = vi.hoisted(() => ({ role: 'ADMIN' }))
const fetchedUrls = vi.hoisted(() => [] as (string | null)[])

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {} }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {} }) }))
vi.mock('@/hooks/use-api', () => ({
  useApi: (url: string | null) => {
    fetchedUrls.push(url)
    if (!url) return {}
    return url.startsWith('/api/auth/me')
      ? { data: { success: true, data: { fullName: 'Tài khoản', username: 'user', role: session.role } } }
      : url.startsWith('/api/shifts')
        ? { data: { success: true, data: null } }
        : { data: { success: true, data: { key: 'PARKING_FEE_UNIT_PRICE', value: '0', label: null } } }
  },
}))

function renderFor(role: string) {
  session.role = role
  fetchedUrls.length = 0
  return renderToStaticMarkup(<MoreScreen />)
}

it('ADMIN thấy lối tắt Đào tạo: Lịch học, Lớp học, Học viên', () => {
  const html = renderFor('ADMIN')

  for (const href of ['/lessons', '/classes', '/students']) {
    expect(html).toContain(`href="${href}"`)
  }
})

it('ADMIN thấy mục Google Calendar trong tab Thêm', () => {
  const html = renderFor('ADMIN')

  expect(html).toContain('Google Calendar')
})

it('mọi ô lối tắt dùng chung một màu vàng brand', () => {
  const html = renderFor('ADMIN')

  const tiles = html.match(/flex h-11 w-11 items-center justify-center[^"]*/g) ?? []
  expect(tiles.length).toBeGreaterThan(0)
  const yellow = tiles.filter((tile) => tile.includes('bg-yellow-bg text-yellow-dark'))
  expect(yellow).toHaveLength(tiles.length)
})

it('STAFF không thấy mục Google Calendar', () => {
  const html = renderFor('STAFF')

  expect(html).not.toContain('Google Calendar')
})

// ── Giáo viên ─────────────────────────────────────────────

it('TEACHER thấy tab Thêm với lối tắt chỉ thuộc Đào tạo', () => {
  const html = renderFor('TEACHER')

  for (const href of ['/lessons', '/classes', '/students']) {
    expect(html).toContain(`href="${href}"`)
  }
  for (const href of ['/bookings', '/customers', '/shifts', '/pricing']) {
    expect(html, href).not.toContain(`href="${href}"`)
  }
  expect(html).not.toContain('Google Calendar')
})

it('TEACHER không thấy trạng thái ca quầy và không gọi API bị proxy chặn', () => {
  const html = renderFor('TEACHER')

  expect(html).not.toContain('Chưa mở ca')
  expect(html).not.toContain('Ca đang mở')
  expect(fetchedUrls.some((url) => url?.startsWith('/api/shifts'))).toBe(false)
  expect(fetchedUrls.some((url) => url?.startsWith('/api/settings'))).toBe(false)
})

it('TEACHER vẫn đổi giao diện và đăng xuất được', () => {
  const html = renderFor('TEACHER')

  expect(html).toContain('Đăng xuất')
  expect(html).toContain('Giao diện')
})
