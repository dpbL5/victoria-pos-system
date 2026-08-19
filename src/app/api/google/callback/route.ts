import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { connectCalendar, mapConnectCalendarError } from '@/lib/students'
import { cookies } from 'next/headers'
import { apiError } from '@/lib/infrastructure/api-helpers'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()

    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')

    if (!code || !state) {
      return NextResponse.redirect(new URL('/lessons?gcal=failed', request.nextUrl.origin), 302)
    }

    // Verify state chống CSRF
    const cookieStore = await cookies()
    const savedState = cookieStore.get('qltrungcung_gcal_state')?.value
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(new URL('/lessons?gcal=failed', request.nextUrl.origin), 302)
    }
    cookieStore.delete('qltrungcung_gcal_state')

    const result = await connectCalendar({ staffId: auth.userId, code })

    if (!result.ok) {
      const err = mapConnectCalendarError(result.error)
      return apiError(err)
    }

    return NextResponse.redirect(new URL('/lessons?gcal=connected', request.nextUrl.origin), 302)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.redirect(new URL('/login', request.nextUrl.origin), 302)
    }
    console.error('GET /api/google/callback error:', error)
    return NextResponse.redirect(new URL('/lessons?gcal=error', request.nextUrl.origin), 302)
  }
}
