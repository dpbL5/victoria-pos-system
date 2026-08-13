'use client'

// ── Bộ biểu đồ SVG/CSS thuần cho màn Báo cáo ──
// Không dùng thư viện chart — tự vẽ theo token thiết kế có sẵn, hỗ trợ light/dark

import { useMemo } from 'react'
import { money } from '@/features/pos/format'

interface ChartDatum {
  label: string
  value: number
}

export interface DonutSlice {
  label: string
  value: number
  color: string
}

interface AreaChartProps {
  data: ChartDatum[]
  height?: number
  /** Nhãn ngày dưới trục (hiển thị mốc đầu + cuối) */
  axisLabels?: [string, string]
}

// ── AreaChart — doanh thu theo ngày ──
export function AreaChart({ data, height = 120, axisLabels }: AreaChartProps) {
  const W = 320
  const H = height
  const pad = 8
  const max = Math.max(...data.map((d) => d.value), 1)
  const stepX = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0

  const points = data.map((d, i) => ({
    x: pad + i * stepX,
    y: H - pad - (d.value / max) * (H - pad * 2),
  }))

  if (points.length === 0) return null

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const lastX = points[points.length - 1].x.toFixed(1)
  const area = `${line} L${lastX},${H - pad} L${pad},${H - pad} Z`

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Biểu đồ doanh thu">
        <defs>
          <linearGradient id="revenue-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Đường lưới ngang */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={W - pad}
            y1={H - pad - f * (H - pad * 2)}
            y2={H - pad - f * (H - pad * 2)}
            stroke="currentColor"
            strokeOpacity="0.08"
          />
        ))}

        <path d={area} fill="url(#revenue-area)" />
        <path d={line} fill="none" stroke="#10b981" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
          <title>
            {data.map((d) => `${d.label}: ${money(d.value)}`).join('\n')}
          </title>
        </path>

        {/* Điểm dữ liệu — hover hiện tooltip */}
        {data.map((d, i) => (
          <circle
            key={d.label}
            cx={points[i].x}
            cy={points[i].y}
            r={data.length > 14 ? 1.5 : 3}
            fill="#10b981"
          >
            <title>{`${d.label}: ${money(d.value)}`}</title>
          </circle>
        ))}
      </svg>

      {axisLabels && (
        <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
          <span>{axisLabels[0]}</span>
          <span>{axisLabels[1]}</span>
        </div>
      )}
    </div>
  )
}

// ── DonutChart — tỷ trọng (phương thức thanh toán, nguồn doanh thu) ──
interface DonutChartProps {
  data: DonutSlice[]
  size?: number
  thickness?: number
  centerValue?: string
}

export function DonutChart({ data, size = 128, thickness = 16, centerValue }: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const radius = (size - thickness) / 2
  const circ = 2 * Math.PI * radius
  const visible = data.filter((d) => d.value > 0)

  // Tính strokeDashoffset tích luỹ cho từng lát — helper ngoài component (pure)
  const slices = useMemo(
    () => buildDonutSlices(visible, total, circ),
    [visible, total, circ]
  )

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Biểu đồ tròn">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth={thickness}
            />
            {slices.map((d) => (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${d.dash} ${circ - d.dash}`}
                strokeDashoffset={-d.offset}
              >
                <title>{`${d.label}: ${money(d.value)} (${donutPercent(d.dash, circ)}%)`}</title>
              </circle>
            ))}
          </g>
          {total > 0 && centerValue && (
            <text
              x="50%"
              y="50%"
              dominantBaseline="central"
              textAnchor="middle"
              className="fill-zinc-950 text-sm font-bold tabular-nums dark:fill-white"
            >
              {centerValue}
            </text>
          )}
        </svg>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {visible.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Chưa có dữ liệu</p>
        ) : (
          visible.map((d) => {
            const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
            return (
              <div key={d.label} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">{d.label}</span>
                <span className="font-medium text-zinc-400 dark:text-zinc-500">{pct}%</span>
                <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">
                  {money(d.value)}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── HourlyBarChart — doanh thu theo khung giờ ──
interface HourlyBarChartProps {
  data: Array<{ hour: number; revenue: number; count: number }>
}

export function HourlyBarChart({ data }: HourlyBarChartProps) {
  const max = Math.max(...data.map((d) => d.revenue), 1)
  if (data.length === 0) return null

  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {data.map((d) => (
          <div key={d.hour} className="group relative flex-1">
            <div
              className="w-full rounded-t bg-blue-500/80 transition-colors group-hover:bg-blue-500 dark:bg-blue-400/80 dark:group-hover:bg-blue-400"
              style={{ height: `${Math.max(2, (d.revenue / max) * 100)}%` }}
            >
              <span className="sr-only">{`${d.hour}:00–${d.hour + 1}:00 · ${money(d.revenue)}`}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        {data.map((d) => (
          <div key={d.hour} className="flex-1 text-center text-[9px] text-zinc-400 dark:text-zinc-500">
            {d.hour}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-500">
        Trục ngang là giờ trong ngày ({data[0].hour}:00–{data[data.length - 1].hour + 1}:00)
      </p>
    </div>
  )
}

// ── Helper — phần trăm của 1 lát donut ──
function donutPercent(dash: number, circ: number): number {
  return circ > 0 ? Math.round((dash / circ) * 100) : 0
}

// ── Helper — tính các lát donut (dash + offset tích luỹ) ──
function buildDonutSlices(
  data: DonutSlice[],
  total: number,
  circ: number
): Array<DonutSlice & { dash: number; offset: number }> {
  let acc = 0
  return data.map((d) => {
    const dash = total > 0 ? (d.value / total) * circ : 0
    const slice = { ...d, dash, offset: acc }
    acc += dash
    return slice
  })
}

// ── DailyVolumeChart — lưu lượng theo ngày (sessions + players) ──
interface DailyVolumeChartProps {
  data: Array<{ label: string; sessions: number; players: number; revenue: number }>
}

export function DailyVolumeChart({ data }: DailyVolumeChartProps) {
  const maxPlayers = Math.max(...data.map((d) => d.players), 1)
  const maxSessions = Math.max(...data.map((d) => d.sessions), 1)
  if (data.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-28 flex-1 items-end gap-1.5">
          {data.map((d) => (
            <div key={d.label} className="group relative flex flex-1 flex-col justify-end gap-0.5">
              <div
                className="w-full rounded-t bg-emerald-500/70 group-hover:bg-emerald-500"
                style={{ height: `${Math.max(2, (d.players / maxPlayers) * 100)}%` }}
              >
                <span className="sr-only">{`${d.label}: ${d.players} người chơi`}</span>
              </div>
              <div
                className="w-full rounded-t bg-blue-500/70 group-hover:bg-blue-500"
                style={{ height: `${Math.max(2, (d.sessions / maxSessions) * 100)}%` }}
              >
                <span className="sr-only">{`${d.label}: ${d.sessions} phiên`}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-500/70" />
            Người chơi
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-blue-500/70" />
            Phiên
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex-1 text-center text-[9px] text-zinc-400 dark:text-zinc-500">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
}
