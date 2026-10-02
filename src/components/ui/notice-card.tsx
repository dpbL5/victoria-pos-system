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
      'border-info-border bg-info-bg text-info',
  },
  success: {
    Icon: AlertCircle,
    classes:
      'border-success-border bg-success-bg text-success',
  },
  warning: {
    Icon: AlertTriangle,
    classes:
      'border-warning-border bg-warning-bg text-warning',
  },
  danger: {
    Icon: AlertCircle,
    classes:
      'border-danger-border bg-danger-bg text-danger',
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
