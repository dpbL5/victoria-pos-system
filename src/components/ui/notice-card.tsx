'use client'

import { AlertCircle, AlertTriangle, type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

type NoticeTone = 'info' | 'success' | 'warning' | 'danger'

interface NoticeCardProps {
  tone: NoticeTone
  title: string
  description: string
  action?: ReactNode
}

const toneConfig: Record<NoticeTone, { Icon: LucideIcon; classes: string }> = {
  info: {
    Icon: AlertCircle,
    classes:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  },
  success: {
    Icon: AlertCircle,
    classes:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  warning: {
    Icon: AlertTriangle,
    classes:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  },
  danger: {
    Icon: AlertCircle,
    classes:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
  },
}

export function NoticeCard({ tone, title, description, action }: NoticeCardProps) {
  const { Icon, classes } = toneConfig[tone]

  return (
    <div className={`flex animate-slide-down items-start justify-between gap-3 rounded-xl border p-3 ${classes}`}>
      <div className="flex gap-2">
        <Icon size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs opacity-90">{description}</p>
        </div>
      </div>
      {action}
    </div>
  )
}
