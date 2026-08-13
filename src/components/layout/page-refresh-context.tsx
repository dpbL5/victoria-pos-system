'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

interface PageRefreshContextValue {
  refresh: (() => void) | null
  registerRefresh: (handler: () => void) => () => void
}

const PageRefreshContext = createContext<PageRefreshContextValue>({
  refresh: null,
  registerRefresh: () => () => {},
})

export function PageRefreshProvider({ children }: { children: React.ReactNode }) {
  const [refresh, setRefresh] = useState<(() => void) | null>(null)
  const handlerRef = useRef<(() => void) | null>(null)

  const registerRefresh = useCallback((handler: () => void) => {
    handlerRef.current = handler
    setRefresh(() => handler)
    return () => {
      handlerRef.current = null
      setRefresh(null)
    }
  }, [])

  useEffect(() => {
    return () => {
      handlerRef.current = null
      setRefresh(null)
    }
  }, [])

  return (
    <PageRefreshContext.Provider value={{ refresh, registerRefresh }}>
      {children}
    </PageRefreshContext.Provider>
  )
}

export function usePageRefresh() {
  return useContext(PageRefreshContext)
}
