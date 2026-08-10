'use client'

import { useEffect, useState } from 'react'

/**
 * Theo dõi một media query — dùng để render responsive giữa mobile/desktop.
 * Mặc định breakpoint md (768px) của Tailwind.
 */
export function useMediaQuery(query = '(min-width: 768px)'): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** true khi màn hình mobile (< 768px) */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 768px)')
}
