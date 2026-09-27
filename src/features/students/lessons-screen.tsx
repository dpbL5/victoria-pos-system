'use client'
import dynamic from 'next/dynamic'
import { AppSkeleton } from '@/components/ui/skeleton'
const LessonsCalendar = dynamic(() => import('./lessons-calendar'), { ssr: false, loading: () => <AppSkeleton /> })
export function LessonsScreen() { return <LessonsCalendar /> }
