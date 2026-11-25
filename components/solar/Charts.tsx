'use client'

import { useRef, useState } from 'react'

export const COLORS = {
  load: '#2a78d6', // 消費
  pv: '#eda100', // 発電
  sell: '#1baf7a', // 売電
  buy: '#eb6834', // 買電
  battery: '#6250d6', // 蓄電池
  none: '#8a8984', // 導入なし
  grid: '#e5e7eb',
  axis: '#6b7280',
}

export type Series = { key: string; label: string; color: string; values: number[]; area?: boolean; dashed?: boolean }

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * p
}

function niceStep(raw: number) {
  if (raw <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

// きりの良い目盛り（0を必ず含む）
function niceTicks(min: number, max: number) {
  const step = niceStep((max - min) / 4 || 1)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6)
  return { lo, hi, ticks }
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
      {items.map(it => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={it.dashed ? { border: `2px dashed ${it.color}` } : { background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

type TooltipState = { idx: number; x: number; y: number; w: number } | null

const fmt = (v: number, digits = 1) => v.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

// ---------- 棒グラフ（グループ） ----------
export function BarChart({
  labels, series, unit, height = 220, digits = 0, stacked = false,
}: {
  labels: string[]; series: Series[]; unit: string; height?: number; digits?: number; stacked?: boolean
}) {
  const [tip, setTip] = useState<TooltipState>(null)
  const ref = useRef<HTMLDivElement>(null)
  const W = 640
  const H = height
  const pad = { l: 48, r: 8, t: 22, b: 24 }
  const n = labels.length
  const totals = labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i]), 0))
  const maxV = stacked ? Math.max(...totals) : Math.max(...series.flatMap(s => s.values))
  const hi = niceMax(maxV)
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const band = plotW / n
  const groupW = band * 0.74
  const barW = stacked ? groupW : Math.max(2, (groupW - (series.length - 1) * 2) / series.length)
  const y = (v: number) => pad.t + plotH - (v / hi) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * hi)

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        {ticks.map(t => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={COLORS.grid} strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={COLORS.axis}>{fmt(t, 0)}</text>
          </g>
        ))}
        {labels.map((lb, i) => {
          const gx = pad.l + band * i + (band - groupW) / 2
          let acc = 0
          return (
            <g key={lb}>
              {tip?.idx === i && <rect x={pad.l + band * i} y={pad.t} width={band} height={plotH} fill="#f3f4f6" />}
              {series.map((s, k) => {
                const v = Math.max(0, s.values[i])
                const x = stacked ? gx : gx + k * (barW + 2)
                const top = stacked ? y(acc + v) : y(v)
                const bottom = stacked ? y(acc) : y(0)
                acc += v
                const h = Math.max(0, bottom - top - (stacked && k > 0 ? 1 : 0))
                return <rect key={s.key} x={x} y={top} width={barW} height={h} rx={stacked ? 1 : 2} fill={s.color} />
              })}
              <text x={pad.l + band * i + band / 2} y={H - 7} textAnchor="middle" fontSize={11} fill={COLORS.axis}>{lb}</text>
              <rect
                x={pad.l + band * i} y={pad.t} width={band} height={plotH} fill="transparent"
                onMouseMove={e => {
                  const r = ref.current?.getBoundingClientRect()
                  if (r) setTip({ idx: i, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width })
                }}
                onTouchStart={e => {
                  const r = ref.current?.getBoundingClientRect()
                  const t = e.touches[0]
                  if (r && t) setTip({ idx: i, x: t.clientX - r.left, y: t.clientY - r.top, w: r.width })
                }}
              />
            </g>
          )
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#9ca3af" strokeWidth={1} />
        <text x={4} y={11} fontSize={10} fill={COLORS.axis}>{unit}</text>
      </svg>
      {tip && <Tooltip tip={tip} title={labels[tip.idx]} rows={series.map(s => ({ label: s.label, color: s.color, value: `${fmt(s.values[tip.idx], digits)} ${unit}` }))} />}
    </div>
  )
}

// ---------- 折れ線グラフ ----------
export function LineChart({
  labels, series, unit, height = 220, digits = 1, zeroLine = false, markers = [], xEvery = 1,
}: {
  labels: string[]; series: Series[]; unit: string; height?: number; digits?: number; zeroLine?: boolean
  markers?: { idx: number; label: string; color: string }[]; xEvery?: number
}) {
  const [tip, setTip] = useState<TooltipState>(null)
  const ref = useRef<HTMLDivElement>(null)
  const W = 640
  const H = height
  const pad = { l: 52, r: 10, t: 22, b: 24 }
  const n = labels.length
  const all = series.flatMap(s => s.values)
  const { lo, hi, ticks } = niceTicks(Math.min(0, ...all), Math.max(...all, 0.0001))
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const x = (i: number) => pad.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => pad.t + plotH - ((v - lo) / (hi - lo || 1)) * plotH

  const onMove = (clientX: number, clientY: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const px = ((clientX - r.left) / r.width) * W
    const i = Math.round(((px - pad.l) / plotW) * (n - 1))
    setTip({ idx: Math.max(0, Math.min(n - 1, i)), x: clientX - r.left, y: clientY - r.top, w: r.width })
  }

  return (
    <div
      ref={ref}
      className="relative touch-pan-y"
      onMouseMove={e => onMove(e.clientX, e.clientY)}
      onMouseLeave={() => setTip(null)}
      onTouchMove={e => e.touches[0] && onMove(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchStart={e => e.touches[0] && onMove(e.touches[0].clientX, e.touches[0].clientY)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        {ticks.map(t => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={COLORS.grid} strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={COLORS.axis}>{fmt(t, Math.abs(hi - lo) < 10 ? 1 : 0)}</text>
          </g>
        ))}
        {(zeroLine || lo < 0) && <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#6b7280" strokeWidth={1} />}
        {labels.map((lb, i) => (i % xEvery === 0 ? (
          <text key={i} x={x(i)} y={H - 7} textAnchor="middle" fontSize={11} fill={COLORS.axis}>{lb}</text>
        ) : null))}
        {series.map(s => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
          return (
            <g key={s.key}>
              {s.area && (
                <polygon points={`${x(0)},${y(Math.max(lo, 0))} ${pts} ${x(n - 1)},${y(Math.max(lo, 0))}`} fill={s.color} opacity={0.22} />
              )}
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })}
        {markers.map(m => (
          <g key={m.label}>
            <circle cx={x(m.idx)} cy={y(0)} r={5} fill={m.color} stroke="#fff" strokeWidth={2} />
          </g>
        ))}
        {tip && (
          <g>
            <line x1={x(tip.idx)} x2={x(tip.idx)} y1={pad.t} y2={pad.t + plotH} stroke="#9ca3af" strokeWidth={1} />
            {series.map(s => (
              <circle key={s.key} cx={x(tip.idx)} cy={y(s.values[tip.idx])} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
            ))}
          </g>
        )}
        <text x={4} y={11} fontSize={10} fill={COLORS.axis}>{unit}</text>
      </svg>
      {tip && <Tooltip tip={tip} title={labels[tip.idx]} rows={series.map(s => ({ label: s.label, color: s.color, value: `${fmt(s.values[tip.idx], digits)} ${unit}` }))} />}
    </div>
  )
}

function Tooltip({ tip, title, rows }: { tip: NonNullable<TooltipState>; title: string; rows: { label: string; color: string; value: string }[] }) {
  const left = tip.x > tip.w / 2 ? tip.x - 196 : tip.x + 14
  return (
    <div
      className="absolute z-10 pointer-events-none bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-xs w-[182px]"
      style={{ left: Math.max(0, left), top: Math.max(0, tip.y - 20) }}
    >
      <p className="font-bold text-gray-800 mb-1">{title}</p>
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-gray-600">
            <span className="w-2 h-2 rounded-sm" style={{ background: r.color }} />{r.label}
          </span>
          <span className="font-semibold text-gray-900 tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// ---------- 横棒（内訳） ----------
export function BreakdownBars({ items, unit, color }: { items: { label: string; value: number }[]; unit: string; color: string }) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="space-y-2">
      {items.map(it => (
        <div key={it.label} className="grid grid-cols-[88px_1fr_120px] items-center gap-2 text-xs">
          <span className="text-gray-600">{it.label}</span>
          <div className="h-3 bg-gray-100 rounded">
            <div className="h-3 rounded" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </div>
          <span className="text-right tabular-nums text-gray-800">
            {fmt(it.value, 0)} {unit} <span className="text-gray-400">({((it.value / total) * 100).toFixed(0)}%)</span>
          </span>
        </div>
      ))}
    </div>
  )
}
