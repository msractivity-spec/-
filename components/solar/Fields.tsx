'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function Section({ title, icon, children, defaultOpen = true, badge }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean; badge?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="bg-white rounded-xl border border-gray-200">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 font-bold text-gray-800 text-sm">
          {icon}
          {title}
          {badge && <span className="text-[10px] font-medium bg-orange-50 text-orange-600 rounded px-1.5 py-0.5">{badge}</span>}
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 grid grid-cols-2 gap-x-3 gap-y-3">{children}</div>}
    </section>
  )
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400'

export function NumField({
  label, value, onChange, unit, step = 1, min, max, hint, full = false,
}: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number; min?: number; max?: number; hint?: string; full?: boolean
}) {
  const [text, setText] = useState(String(value))
  const [prev, setPrev] = useState(value)
  // 外部から値が変わった（プラン読込など）ときだけ表示文字列を同期
  if (prev !== value) {
    setPrev(value)
    if (Number(text) !== value) setText(String(value))
  }
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          className={inputCls}
          value={text}
          step={step}
          min={min}
          max={max}
          onChange={e => {
            setText(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(n)) onChange(n)
          }}
          onBlur={() => {
            let n = Number(text)
            if (!Number.isFinite(n) || text === '') n = value
            if (min !== undefined) n = Math.max(min, n)
            if (max !== undefined) n = Math.min(max, n)
            setText(String(n))
            onChange(n)
          }}
        />
        {unit && <span className="text-xs text-gray-500 whitespace-nowrap">{unit}</span>}
      </div>
      {hint && <span className="block text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</span>}
    </label>
  )
}

export function SelectField<T extends string | number>({
  label, value, onChange, options, hint, full = false,
}: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; hint?: string; full?: boolean
}) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      <select
        className={inputCls}
        value={String(value)}
        onChange={e => {
          const opt = options.find(o => String(o.value) === e.target.value)
          if (opt) onChange(opt.value)
        }}
      >
        {options.map(o => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
      {hint && <span className="block text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</span>}
    </label>
  )
}

export function Toggle({ label, checked, onChange, hint, full = true }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; full?: boolean }) {
  return (
    <label className={`flex items-start gap-2 cursor-pointer ${full ? 'col-span-2' : ''}`}>
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-orange-500" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>
        <span className="text-sm text-gray-700">{label}</span>
        {hint && <span className="block text-[11px] text-gray-400 leading-snug">{hint}</span>}
      </span>
    </label>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="col-span-2 text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-2 leading-relaxed">{children}</p>
}
