'use client'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
const LessonsCalendar = dynamic(() => import('./lessons-calendar'), { ssr: false, loading: () => <div className="p-5"><Skeleton className="h-12 w-64" /><Skeleton className="mt-5 h-[70vh] w-full" /></div> })
export function LessonsScreen() { return <LessonsCalendar /> }
