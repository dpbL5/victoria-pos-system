import { jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

const SESSION_NAME = 'qltrungcung_session'
const rawSessionSecret = process.env.SESSION_SECRET
const hasStrongSessionSecret = !!rawSessionSecret && rawSessionSecret.length >= 32

if (!hasStrongSessionSecret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET chưa được cấu hình hoặc quá ngắn. ' +
      'Tạo secret mới: openssl rand -hex 32'
    )
  }
  throw new Error(
    'Thiếu SESSION_SECRET trong .env. ' +
    'Tạo secret mới: openssl rand -hex 32'
  )
}

const SESSION_SECRET = new TextEncoder().encode(rawSessionSecret as string)

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout']

function isTeacherTrainingPath(pathname: string) {
  return ['/lessons', '/classes', '/students', '/api/lessons', '/api/classes', '/api/students', '/api/series', '/api/google']
  .some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function isPublicStaticAsset(pathname: string) {
  return /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|pdf|txt|xml|json|js|css|map)$/i.test(pathname)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next()
  }

  if (isPublicStaticAsset(pathname)) {
    return NextResponse.next()
  }

  if (process.env.NODE_ENV === 'production' && !hasStrongSessionSecret) {
    return redirectToLogin(request)
  }

  const token = request.cookies.get(SESSION_NAME)?.value
  if (!token && pathname.startsWith('/api/')) {
    return NextResponse.next()
  }
  if (!token) {
    return redirectToLogin(request)
  }

  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET)
    if (payload.role === 'TEACHER' && pathname !== '/api/auth/me' && !isTeacherTrainingPath(pathname)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, error: 'Bạn chỉ được phép truy cập module Đào tạo' },
          { status: 403 },
  )
}
return NextResponse.redirect(new URL('/lessons', request.url))
}
    return NextResponse.next()
  } catch {
    if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }
    return redirectToLogin(request)
  }
  }

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL('/login', request.url)
  // Chỉ chấp nhận callbackUrl là đường dẫn nội bộ (tránh open redirect)
  const callbackPath = request.nextUrl.pathname
  if (callbackPath && callbackPath.startsWith('/') && !callbackPath.startsWith('//')) {
    loginUrl.searchParams.set('callbackUrl', callbackPath)
  }
  return NextResponse.redirect(loginUrl)
  }

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  }
