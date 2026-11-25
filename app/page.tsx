'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Sun, Printer, Save, Download, Upload, RotateCcw, Trash2, SlidersHorizontal, BarChart3 } from 'lucide-react'
import { simulate } from '@/lib/solar/engine'
import { DEFAULT_INPUTS, type Inputs } from '@/lib/solar/types'
import InputPanel from '@/components/solar/InputPanel'
import ResultsPanel from '@/components/solar/ResultsPanel'

const STORAGE_KEY = 'solar-sim:current:v1'
const SAVED_KEY = 'solar-sim:saved:v1'

type Saved = { name: string; savedAt: string; inputs: Inputs }

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 保存できない環境（プライベートモード等）は無視
  }
}

// 古い保存データに新しい項目が欠けていても動くように補完
function normalize(x: Partial<Inputs>): Inputs {
  return { ...DEFAULT_INPUTS, ...x, plan: { ...DEFAULT_INPUTS.plan, ...(x.plan ?? {}) } }
}

export default function SolarPage() {
  const [inp, setInp] = useState<Inputs>(DEFAULT_INPUTS)
  const [saved, setSaved] = useState<Saved[]>([])
  const [tab, setTab] = useState<'input' | 'result'>('input')
  const [ready, setReady] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // localStorage はブラウザでのみ読めるためマウント後に復元する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInp(normalize(load<Partial<Inputs>>(STORAGE_KEY, DEFAULT_INPUTS)))
    setSaved(load<Saved[]>(SAVED_KEY, []))
    setReady(true)
  }, [])
  useEffect(() => {
    if (ready) store(STORAGE_KEY, inp)
  }, [inp, ready])

  const deferred = useDeferredValue(inp)
  // 計算はブラウザ側のみ（保存データの復元後に実行）
  const result = useMemo(() => (ready ? simulate(deferred) : null), [deferred, ready])
  const stale = deferred !== inp

  const set = (patch: Partial<Inputs>) => setInp(prev => ({ ...prev, ...patch }))

  const saveScenario = () => {
    const name = window.prompt('保存名を入力してください', inp.projectName || `プラン${saved.length + 1}`)
    if (!name) return
    const next = [...saved.filter(s => s.name !== name), { name, savedAt: new Date().toLocaleString('ja-JP'), inputs: inp }]
    setSaved(next)
    store(SAVED_KEY, next)
  }
  const removeScenario = (name: string) => {
    if (!window.confirm(`「${name}」を削除しますか？`)) return
    const next = saved.filter(s => s.name !== name)
    setSaved(next)
    store(SAVED_KEY, next)
  }
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(inp, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${inp.projectName || 'solar-simulation'}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (file: File) => {
    try {
      setInp(normalize(JSON.parse(await file.text())))
    } catch {
      window.alert('ファイルを読み込めませんでした')
    }
  }

  // 保存済みプランの比較
  const compare = useMemo(() => (!ready ? [] : saved.map(s => {
    const r = simulate(normalize(s.inputs))
    const bat = !!r.flowC
    const lastY = r.years[r.years.length - 1]
    return {
      name: s.name,
      kw: r.totalKw,
      bat: bat ? s.inputs.batteryKwh : 0,
      ua: s.inputs.ua,
      load: r.loadYear,
      pv: r.pvYear1,
      annual: bat ? r.annualC : r.annualB,
      save: r.annualA - (bat ? r.annualC : r.annualB),
      cum: bat ? lastY.cumC : lastY.cumB,
      payback: bat ? r.paybackC : r.paybackB,
      selfSuff: bat ? r.selfSuffC : r.selfSuffB,
    }
  })), [saved, ready])

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto print:px-0 print:py-0">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-sm text-gray-500 flex items-center gap-1"><Sun size={14} className="text-orange-500" />太陽光・蓄電池 導入効果シミュレーション</p>
          <h1 className="text-xl font-bold text-gray-900">{inp.projectName || '太陽光・蓄電池シミュレーター'}</h1>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={saveScenario} className="flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-3 py-2"><Save size={14} />プラン保存</button>
          <button type="button" onClick={() => window.print()} className="flex items-center gap-1 text-xs bg-white border border-gray-300 rounded-lg px-3 py-2"><Printer size={14} />印刷・PDF</button>
          <button type="button" onClick={exportJson} className="flex items-center gap-1 text-xs bg-white border border-gray-300 rounded-lg px-3 py-2"><Download size={14} />書き出し</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs bg-white border border-gray-300 rounded-lg px-3 py-2"><Upload size={14} />読み込み</button>
          <button type="button" onClick={() => window.confirm('入力を初期値に戻しますか？') && setInp(DEFAULT_INPUTS)} className="flex items-center gap-1 text-xs bg-white border border-gray-300 rounded-lg px-3 py-2"><RotateCcw size={14} />初期値</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = '' }} />
        </div>
      </div>

      {/* モバイル用タブ */}
      <div className="xl:hidden flex bg-white border border-gray-200 rounded-xl p-1 mb-4 sticky top-2 z-20 print:hidden">
        <button type="button" onClick={() => setTab('input')} className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm ${tab === 'input' ? 'bg-orange-500 text-white' : 'text-gray-600'}`}><SlidersHorizontal size={15} />条件入力</button>
        <button type="button" onClick={() => setTab('result')} className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm ${tab === 'result' ? 'bg-orange-500 text-white' : 'text-gray-600'}`}>
          <BarChart3 size={15} />結果
          {result && <span className="text-[11px] opacity-90">（年{Math.round((result.annualA - (result.flowC ? result.annualC : result.annualB)) / 10000)}万円削減）</span>}
        </button>
      </div>

      <div className="xl:grid xl:grid-cols-[420px_1fr] xl:gap-6">
        <div className={`${tab === 'input' ? 'block' : 'hidden'} xl:block print:hidden`}>
          <InputPanel inp={inp} set={set} />
        </div>
        <div className={`${tab === 'result' ? 'block' : 'hidden'} xl:block print:block transition-opacity ${stale ? 'opacity-60' : ''}`}>
          <div className="space-y-4">
            {result ? <ResultsPanel r={result} inp={deferred} /> : <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">計算中…</div>}

            {saved.length > 0 && (
              <section className="bg-white rounded-xl border border-gray-200 p-4 print:hidden">
                <h3 className="font-bold text-gray-800 text-sm">保存したプランの比較</h3>
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-xs tabular-nums whitespace-nowrap">
                    <thead>
                      <tr className="text-gray-500 border-b">
                        <th className="text-left py-1 font-normal">プラン</th>
                        <th className="text-right font-normal">UA値</th>
                        <th className="text-right font-normal">太陽光</th>
                        <th className="text-right font-normal">蓄電池</th>
                        <th className="text-right font-normal">消費量</th>
                        <th className="text-right font-normal">発電量</th>
                        <th className="text-right font-normal">自給率</th>
                        <th className="text-right font-normal">年間削減</th>
                        <th className="text-right font-normal">累積効果</th>
                        <th className="text-right font-normal">回収</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {compare.map((c, i) => (
                        <tr key={c.name} className="border-b border-gray-100">
                          <td className="py-1.5">
                            <button type="button" className="text-orange-600 underline" onClick={() => setInp(normalize(saved[i].inputs))}>{c.name}</button>
                          </td>
                          <td className="text-right">{c.ua}</td>
                          <td className="text-right">{c.kw.toFixed(1)}kW</td>
                          <td className="text-right">{c.bat ? `${c.bat}kWh` : '—'}</td>
                          <td className="text-right">{Math.round(c.load).toLocaleString()}</td>
                          <td className="text-right">{Math.round(c.pv).toLocaleString()}</td>
                          <td className="text-right">{(c.selfSuff * 100).toFixed(0)}%</td>
                          <td className="text-right">{Math.round(c.save).toLocaleString()}円</td>
                          <td className="text-right">{(c.cum / 10000).toFixed(0)}万円</td>
                          <td className="text-right">{c.payback ? `${c.payback}年` : '—'}</td>
                          <td className="text-right"><button type="button" aria-label="削除" onClick={() => removeScenario(c.name)} className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">プラン名をクリックすると入力に読み込みます。保存データはこの端末のブラウザに保存されます（他端末へは「書き出し」で移動できます）。</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
