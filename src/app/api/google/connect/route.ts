import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { buildAuthUrl, getGoogleConfig } from '@/lib/google'
import { cookies } from 'next/headers'
import { ERR_UNAUTHORIZED, ERR_FORBIDDEN } from '@/lib/infrastructure/api-helpers'

export async function GET() {
  try {
    await requireAdmin()

    const config = getGoogleConfig()
    if (!config.isConfigured) {
      return NextResponse.json(
        { success: false, code: 'GOOGLE_NOT_CONFIGURED', error: 'Chưa cấu hình Google Calendar (thiếu GOOGLE_CLIENT_ID/SECRET/NEXT_PUBLIC_APP_URL)' },
        { status: 400 }
      )
    }

    // State chống CSRF — cookie httpOnly, verify ở callback
    const state = crypto.randomUUID()
    const cookieStore = await cookies()
    cookieStore.set('qltrungcung_gcal_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 600,
      path: '/',
    })

    return NextResponse.redirect(buildAuthUrl(state), 302)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    if (message === 'FORBIDDEN') return NextResponse.json({ success: false, error: 'Không có quyền' }, { status: 403 })
    console.error('GET /api/google/connect error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
