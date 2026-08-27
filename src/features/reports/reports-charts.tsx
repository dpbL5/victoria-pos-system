'use client'

// ── Bộ biểu đồ recharts cho màn Báo cáo ──
// Thay thế SVG/CSS tự vẽ — dùng recharts@3 (đã có sẵn) với token màu Tailwind v4.

import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { money } from '@/features/pos/format'

// ── Tokens màu dùng cho chart — tương ứng với Tailwind palette đang dùng ──
const COLORS = {
  emerald: '#10b981',
  blue: '#3b82f6',
  purple: '#a855f7',
  amber: '#f59e0b',
  red: '#ef4444',
  rose: '#f43f5e',
  zinc: '#71717a',
} as const

const AXIS_TICK = { fill: 'currentColor', fontSize: 11, opacity: 0.6 }
const GRID_STROKE = 'currentColor'

interface TooltipEntry {
  name?: string | number
  dataKey?: string | number
  value?: number | string
  payload?: Record<string, unknown>
  color?: string
}

/** Render helper cho tooltip — recharts 3.x truyền payload/label qua render prop. */
function renderMoneyTooltip(
  active: boolean | undefined,
  payload: unknown,
  label: string | number | undefined,
  labelFormatter?: (payload: TooltipEntry[]) => string,
  valueFormatter: (v: number) => string = (v) => money(v),
) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  const entries = payload as TooltipEntry[]
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {label ? (
        <div className="font-semibold text-zinc-950 dark:text-white">
          {labelFormatter ? labelFormatter(entries) : String(label)}
        </div>
      ) : null}
      {entries.map((entry) => (
        <div key={String(entry.dataKey ?? entry.name ?? '')} className="text-zinc-600 dark:text-zinc-300">
          <span className="font-medium tabular-nums text-zinc-950 dark:text-white">
            {valueFormatter(Number(entry.value ?? 0))}
          </span>
          {entry.name ? <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">{String(entry.name)}</span> : null}
        </div>
      ))}
    </div>
  )
}

// ── AreaChart — doanh thu theo ngày ──
export function AreaChart({
  data,
  height = 200,
  axisLabels,
}: {
  data: Array<{ label: string; value: number }>
  height?: number
  axisLabels?: [string, string]
}) {
  if (data.length === 0) return null
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsAreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="revenue-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.emerald} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COLORS.emerald} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_STROKE} strokeOpacity={0.08} vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            className="text-zinc-500 dark:text-zinc-400"
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={50}
            tickFormatter={(v: number) => formatAxisMoney(v)}
            className="text-zinc-500 dark:text-zinc-400"
          />
          <Tooltip
            content={({ active, payload, label }) => renderMoneyTooltip(active, payload, label)}
            cursor={{ stroke: COLORS.emerald, strokeOpacity: 0.2, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={COLORS.emerald}
            strokeWidth={2}
            fill="url(#revenue-area)"
            isAnimationActive
            animationDuration={400}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
      {axisLabels ? (
        <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
          <span>{axisLabels[0]}</span>
          <span>{axisLabels[1]}</span>
        </div>
      ) : null}
    </div>
  )
}

function formatAxisMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}tr`
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`
  return String(v)
}

// ── DonutChart — tỷ trọng (phương thức thanh toán, nguồn doanh thu) ──
export interface DonutSlice {
  label: string
  value: number
  color: string
}

export function DonutChart({
  data,
  size = 200,
  thickness = 28,
  centerValue,
}: {
  data: DonutSlice[]
  size?: number
  thickness?: number
  centerValue?: string
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const visible = data.filter((d) => d.value > 0)
  const radius = (size - thickness) / 2
  const innerRadius = radius

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width={size} height={size}>
          <RechartsPieChart>
            <Pie
              data={visible}
              dataKey="value"
              nameKey="label"
              innerRadius={innerRadius}
              outerRadius={radius}
              strokeWidth={0}
              paddingAngle={1}
              isAnimationActive
              animationDuration={400}
            >
              {visible.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null
                const item = payload[0]
                const value = Number(item.value)
                const pct = total > 0 ? Math.round((value / total) * 100) : 0
                return (
                  <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="font-semibold text-zinc-950 dark:text-white">
                      {item.name}
                    </div>
                    <div className="text-zinc-600 dark:text-zinc-300">
                      <span className="font-medium tabular-nums text-zinc-950 dark:text-white">
                        {money(value)}
                      </span>
                      <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                        {pct}%
                      </span>
                    </div>
                  </div>
                )
              }}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
        {total > 0 && centerValue ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-base font-bold tabular-nums text-zinc-950 dark:text-white">
              {centerValue}
            </span>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {visible.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Chưa có dữ liệu</p>
        ) : (
          visible.map((d) => {
            const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
            return (
              <div key={d.label} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: d.color }}
                />
                <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">
                  {d.label}
                </span>
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
export function HourlyBarChart({
  data,
  height = 160,
}: {
  data: Array<{ hour: number; revenue: number; count: number }>
  height?: number
}) {
  if (data.length === 0) return null
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barCategoryGap="20%"
        >
          <CartesianGrid stroke={GRID_STROKE} strokeOpacity={0.08} vertical={false} />
          <XAxis
            dataKey="hour"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}h`}
            className="text-zinc-500 dark:text-zinc-400"
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={50}
            tickFormatter={(v: number) => formatAxisMoney(v)}
            className="text-zinc-500 dark:text-zinc-400"
          />
          <Tooltip
            content={({ active, payload, label }) => renderMoneyTooltip(
              active,
              payload,
              label,
              (entries) => {
                const hour = entries[0]?.payload?.hour
                if (typeof hour !== 'number') return ''
                return `${hour}:00 – ${hour + 1}:00`
              },
            )}
            cursor={{ fill: COLORS.blue, fillOpacity: 0.08 }}
          />
          <Bar
            dataKey="revenue"
            name="Doanh thu"
            fill={COLORS.blue}
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationDuration={400}
          />
        </RechartsBarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-500">
        Trục ngang là giờ trong ngày
      </p>
    </div>
  )
}

// ── DailyVolumeChart — lưu lượng theo ngày (players + sessions) ──
export function DailyVolumeChart({
  data,
  height = 180,
}: {
  data: Array<{ label: string; sessions: number; players: number; revenue: number }>
  height?: number
}) {
  if (data.length === 0) return null
  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={height}>
            <RechartsBarChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid stroke={GRID_STROKE} strokeOpacity={0.08} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                minTickGap={20}
                className="text-zinc-500 dark:text-zinc-400"
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={32}
                className="text-zinc-500 dark:text-zinc-400"
              />
              <Tooltip
                content={({ active, payload, label }) => renderMoneyTooltip(
                  active,
                  payload,
                  label,
                  undefined,
                  (v) => String(v),
                )}
                cursor={{ fill: COLORS.zinc, fillOpacity: 0.06 }}
              />
              <Bar
                dataKey="players"
                name="Người chơi"
                fill={COLORS.emerald}
                radius={[4, 4, 0, 0]}
                isAnimationActive
                animationDuration={400}
              />
              <Bar
                dataKey="sessions"
                name="Phiên"
                fill={COLORS.blue}
                radius={[4, 4, 0, 0]}
                isAnimationActive
                animationDuration={400}
              />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 pt-6 text-[10px] text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.emerald }} />
            Người chơi
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.blue }} />
            Phiên
          </div>
        </div>
      </div>
    </div>
  )
}
