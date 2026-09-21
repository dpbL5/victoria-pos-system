import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { MoreScreen } from './more-screen'

const session = vi.hoisted(() => ({ role: 'ADMIN' }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {} }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {} }) }))
vi.mock('@/hooks/use-api', () => ({
  useApi: (url: string | null) =>
    !url
      ? {}
      : url.startsWith('/api/auth/me')
        ? { data: { success: true, data: { fullName: 'Quản trị', username: 'admin', role: session.role } } }
        : url.startsWith('/api/shifts')
          ? { data: { success: true, data: null } }
          : { data: { success: true, data: { key: 'PARKING_FEE_UNIT_PRICE', value: '0', label: null } } },
}))

it('ADMIN thấy lối tắt Đào tạo: Lịch học, Lớp học, Học viên', () => {
  session.role = 'ADMIN'
  const html = renderToStaticMarkup(<MoreScreen />)

  for (const href of ['/lessons', '/classes', '/students']) {
    expect(html).toContain(`href="${href}"`)
  }
})

it('ADMIN thấy mục Google Calendar trong tab Thêm', () => {
  session.role = 'ADMIN'
  const html = renderToStaticMarkup(<MoreScreen />)

  expect(html).toContain('Google Calendar')
})

it('STAFF không thấy mục Google Calendar', () => {
  session.role = 'STAFF'
  const html = renderToStaticMarkup(<MoreScreen />)

  expect(html).not.toContain('Google Calendar')
})
