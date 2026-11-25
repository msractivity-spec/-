'use client'

import { Fragment, useMemo, useState } from 'react'
import { LOAD_CATS, isHoliday, monthOfDay, type SimResult } from '@/lib/solar/engine'
import type { Inputs } from '@/lib/solar/types'
import { findClimate } from '@/lib/solar/climate'
import { BarChart, BreakdownBars, COLORS, Legend, LineChart } from './Charts'

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`
const man = (v: number) => `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円`
const kwh = (v: number) => `${Math.round(v).toLocaleString('ja-JP')} kWh`
const pct = (v: number) => `${(v * 100).toFixed(0)}%`
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function Card({ title, children, sub }: { title: string; children: React.ReactNode; sub?: string }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 break-inside-avoid">
      <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${accent ? 'text-orange-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 leading-snug">{sub}</p>}
    </div>
  )
}

export default function ResultsPanel({ r, inp }: { r: SimResult; inp: Inputs }) {
  const hasBat = !!r.flowC
  const [month, setMonth] = useState(7)
  const [dayType, setDayType] = useState<'avg' | 'sunny' | 'cloudy' | 'weekday' | 'holiday'>('avg')
  const [showYears, setShowYears] = useState(false)
  const last = r.years[r.years.length - 1]
  const flow = r.flowC ?? r.flowB

  // 1日の電気の流れ
  const day = useMemo(() => {
    const days: number[] = []
    for (let d = 0; d < 365; d++) if (monthOfDay(d) === month) days.push(d)
    let pick = days
    if (dayType === 'sunny') pick = [...days].sort((a, b) => r.dayKt[b] - r.dayKt[a]).slice(0, 1)
    if (dayType === 'cloudy') pick = [...days].sort((a, b) => r.dayKt[a] - r.dayKt[b]).slice(0, 1)
    if (dayType === 'weekday') pick = days.filter(d => !isHoliday(d))
    if (dayType === 'holiday') pick = days.filter(d => isHoliday(d))
    const avg = (arr: ArrayLike<number>) => Array.from({ length: 24 }, (_, h) => pick.reduce((a, d) => a + arr[d * 24 + h], 0) / pick.length)
    return {
      label: pick.length === 1 ? `${month + 1}月${pick[0] - days[0] + 1}日` : `${month + 1}月の${dayType === 'weekday' ? '平日' : dayType === 'holiday' ? '休日' : ''}平均`,
      load: avg(flow.load), pv: avg(flow.pv), buy: avg(flow.buy), sell: avg(flow.sell),
      charge: avg(flow.charge), discharge: avg(flow.discharge), soc: avg(flow.soc),
      temp: avg(r.tempHour),
    }
  }, [month, dayType, flow, r.dayKt, r.tempHour])

  const scenarios = [
    { key: 'A', label: '導入なし', value: r.annualA, color: COLORS.none },
    { key: 'B', label: `太陽光のみ（${r.totalKw.toFixed(1)}kW）`, value: r.annualB, color: COLORS.pv },
    ...(hasBat ? [{ key: 'C', label: `太陽光＋蓄電池（${inp.batteryKwh}kWh）`, value: r.annualC, color: COLORS.battery }] : []),
  ]
  const maxScen = Math.max(...scenarios.map(s => s.value), 1)
  const best = hasBat ? 'C' : 'B'
  const payback = hasBat ? r.paybackC : r.paybackB
  const cum = hasBat ? last.cumC : last.cumB
  const useLoan = inp.loanRate > 0
  const monthlyLoan = (() => {
    if (!useLoan) return 0
    const pr = hasBat ? r.investC : r.investB
    const rr = inp.loanRate / 100 / 12
    const n = inp.loanYears * 12
    return (pr * rr) / (1 - Math.pow(1 + rr, -n))
  })()

  const cl = findClimate(inp.climateId)
  const conditions: [string, string][] = [
    ['建設地', `${cl.pref} ${cl.name}（${cl.zone}地域）`],
    ['建物', `延床${inp.floorArea}m² ${inp.stories === 1 ? '平屋' : `${inp.stories}階建`}／UA値 ${inp.ua}／C値 ${inp.cValue}／${inp.ventType === 'type1' ? `第1種換気(熱交換${inp.heatRecovery}%)` : '第3種換気'}`],
    ['冷暖房', `${inp.hvacMode === 'whole' ? '全館空調(24h)' : '個別エアコン(在室時)'}／APF ${inp.apf}／暖房${inp.heatSet}℃・冷房${inp.coolSet}℃`],
    ['家族', `大人${inp.adults}人・子ども${inp.children}人・高齢者${inp.elderly}人／平日日中在宅${inp.daytimeHome}人`],
    ['給湯・調理', `${inp.waterHeater === 'ecocute' ? `エコキュート${inp.ecocuteSolarMode ? '(昼間沸き上げ)' : ''}` : inp.waterHeater === 'gas' ? 'ガス給湯器' : '電気温水器'}／${inp.cooking === 'ih' ? 'IH' : 'ガスコンロ'}${inp.ev ? `／EV 年${inp.evKmPerYear.toLocaleString()}km` : ''}`],
    ['太陽光', inp.arrays.map(a => `${a.kw}kW(方位${a.azimuth}°・${a.pitchSun}寸)`).join('＋') + `／パワコン${inp.pcsKw}kW`],
    ['蓄電池', inp.battery ? `${inp.batteryKwh}kWh／${inp.batteryKw}kW／${inp.batteryMode === 'green' ? 'グリーンモード' : inp.batteryMode === 'economy' ? '経済モード' : 'AI予測モード'}` : 'なし'],
    ['電力プラン', `${inp.plan.name}／売電 ${inp.sellFit1}円(1-4年)・${inp.sellFit2}円(5-10年)・${inp.sellPost}円(11年〜)`],
  ]

  return (
    <div className="space-y-4">
      <section className="hidden print:block bg-white rounded-xl border border-gray-200 p-4 text-[11px]">
        <p className="font-bold text-gray-800 text-sm mb-1">試算条件</p>
        <dl className="grid grid-cols-[80px_1fr] gap-y-0.5">
          {conditions.map(([k, v]) => (<Fragment key={k}><dt className="text-gray-500">{k}</dt><dd>{v}</dd></Fragment>))}
        </dl>
      </section>
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Stat accent label="1年目の光熱費削減額" value={yen(r.annualA - (hasBat ? r.annualC : r.annualB))} sub={`月あたり 約${yen((r.annualA - (hasBat ? r.annualC : r.annualB)) / 12)}`} />
        <Stat accent label={useLoan ? `${inp.years}年間の累積収支（ローン返済後）` : `${inp.years}年間の累積効果（初期費用差引後）`} value={man(cum)} sub={useLoan ? `ローン返済 月${yen(monthlyLoan)}` : payback ? `投資回収 ${payback}年目` : '期間内に回収できません'} />
        <Stat label="年間発電量" value={kwh(r.pvYear1)} sub={`${Math.round(r.specificYield).toLocaleString()} kWh/kW・年`} />
        <Stat label="年間消費電力量" value={kwh(r.loadYear)} sub={`1日平均 ${(r.loadYear / 365).toFixed(1)} kWh`} />
        <Stat label="自給率（電力の自給割合）" value={pct(hasBat ? r.selfSuffC : r.selfSuffB)} sub={hasBat ? `太陽光のみ ${pct(r.selfSuffB)}` : undefined} />
        <Stat label="自家消費率（発電の自宅利用割合）" value={pct(hasBat ? r.selfConsC : r.selfConsB)} sub={hasBat ? `太陽光のみ ${pct(r.selfConsB)}` : undefined} />
        <Stat label="CO₂削減量" value={`${(r.co2Year / 1000).toFixed(2)} t/年`} sub={`杉の木 約${Math.round(r.co2Year / 8.8)}本分`} />
        {hasBat
          ? <Stat label="停電時の使用可能時間" value={`最大 ${r.backupFullHours.toFixed(0)} 時間`} sub={`${inp.backupLoadW}W使用時／夕方の平均残量で約${r.backupEveningHours.toFixed(0)}時間`} />
          : <Stat label="年間 発電−消費" value={kwh(r.pvYear1 - r.loadYear)} sub={r.pvYear1 >= r.loadYear ? 'ネット・ゼロ達成（電力量ベース）' : '消費が発電を上回ります'} />}
      </div>

      <Card title="年間の電気代（売電収入を差し引いた実質額・1年目）" sub="基本料金・燃料費調整額・再エネ賦課金を含みます">
        <div className="space-y-2.5">
          {scenarios.map(s => (
            <div key={s.key} className="grid grid-cols-[150px_1fr_96px] items-center gap-2 text-xs">
              <span className="text-gray-700">{s.label}</span>
              <div className="h-5 bg-gray-100 rounded">
                <div className="h-5 rounded" style={{ width: `${Math.max(0, (s.value / maxScen) * 100)}%`, background: s.color }} />
              </div>
              <span className={`text-right tabular-nums font-semibold ${s.key === best ? 'text-orange-600' : 'text-gray-800'}`}>{yen(s.value)}</span>
            </div>
          ))}
        </div>
        {r.gasYearCost > 0 && <p className="text-[11px] text-gray-500 mt-2">別途ガス代 約{yen(r.gasYearCost)}/年（全ケース共通）</p>}
      </Card>

      <Card title="月別の発電量と消費量" sub="バーにカーソルを合わせると詳細が表示されます">
        <Legend items={[{ label: '発電量', color: COLORS.pv }, { label: '消費量', color: COLORS.load }, { label: '買電量', color: COLORS.buy }, { label: '売電量', color: COLORS.sell }]} />
        <BarChart
          labels={MONTH_LABELS}
          unit="kWh"
          series={[
            { key: 'pv', label: '発電量', color: COLORS.pv, values: r.months.map(m => m.pv) },
            { key: 'load', label: '消費量', color: COLORS.load, values: r.months.map(m => m.load) },
            { key: 'buy', label: '買電量', color: COLORS.buy, values: r.months.map(m => (hasBat ? m.C.buy : m.B.buy)) },
            { key: 'sell', label: '売電量', color: COLORS.sell, values: r.months.map(m => (hasBat ? m.C.sell : m.B.sell)) },
          ]}
        />
      </Card>

      <Card title="1日の電気の流れ" sub={`${day.label}（${hasBat ? '太陽光＋蓄電池' : '太陽光のみ'}）`}>
        <div className="flex flex-wrap gap-1 mb-2 print:hidden">
          {MONTH_LABELS.map((m, i) => (
            <button key={m} type="button" onClick={() => setMonth(i)} className={`px-2 py-1 rounded text-xs ${month === i ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{m}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 mb-3 print:hidden">
          {([['avg', '月平均'], ['weekday', '平日平均'], ['holiday', '休日平均'], ['sunny', '晴天日'], ['cloudy', '雨・曇天日']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setDayType(k)} className={`px-2 py-1 rounded text-xs ${dayType === k ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>
          ))}
        </div>
        <Legend items={[{ label: '発電', color: COLORS.pv }, { label: '消費', color: COLORS.load }, { label: '買電', color: COLORS.buy }, { label: '売電', color: COLORS.sell }, ...(hasBat ? [{ label: '蓄電池から放電', color: COLORS.battery }] : [])]} />
        <LineChart
          labels={Array.from({ length: 24 }, (_, h) => `${h}時`)}
          unit="kWh"
          xEvery={3}
          digits={2}
          series={[
            { key: 'pv', label: '発電', color: COLORS.pv, values: day.pv, area: true },
            { key: 'load', label: '消費', color: COLORS.load, values: day.load },
            { key: 'buy', label: '買電', color: COLORS.buy, values: day.buy, dashed: true },
            { key: 'sell', label: '売電', color: COLORS.sell, values: day.sell, dashed: true },
            ...(hasBat ? [{ key: 'dis', label: '放電', color: COLORS.battery, values: day.discharge }] : []),
          ]}
        />
        {hasBat && (
          <>
            <p className="text-xs text-gray-600 mt-3 mb-1">蓄電池の残量（kWh）</p>
            <LineChart labels={Array.from({ length: 24 }, (_, h) => `${h}時`)} unit="kWh" height={140} xEvery={3} digits={1}
              series={[{ key: 'soc', label: '残量', color: COLORS.battery, values: day.soc, area: true }]} />
          </>
        )}
        <p className="text-[11px] text-gray-500 mt-2">
          この日の合計：発電 {day.pv.reduce((a, b) => a + b, 0).toFixed(1)} kWh ／ 消費 {day.load.reduce((a, b) => a + b, 0).toFixed(1)} kWh ／ 買電 {day.buy.reduce((a, b) => a + b, 0).toFixed(1)} kWh ／ 売電 {day.sell.reduce((a, b) => a + b, 0).toFixed(1)} kWh
          ／ 平均気温 {(day.temp.reduce((a, b) => a + b, 0) / 24).toFixed(1)}℃
        </p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="消費電力の内訳（年間）">
          <BreakdownBars unit="kWh" color={COLORS.load} items={LOAD_CATS.filter(c => r.loadByCat[c.key] > 0).map(c => ({ label: c.label, value: r.loadByCat[c.key] }))} />
          {hasBat && inp.batteryStandbyW > 0 && <p className="text-[11px] text-gray-500 mt-2">別途 蓄電池の待機電力 {kwh(inp.batteryStandbyW * 8.76)}/年</p>}
        </Card>
        <Card title="建物の熱性能（計算に使用した値）">
          <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
            <dt className="text-gray-500">外皮面積</dt><dd className="text-right tabular-nums">{r.envelopeArea.toFixed(0)} m²{inp.envelopeArea === 0 && '（推定）'}</dd>
            <dt className="text-gray-500">自然漏気回数（C値より）</dt><dd className="text-right tabular-nums">{r.infiltrationAch.toFixed(2)} 回/h</dd>
            <dt className="text-gray-500">熱損失係数（換気・漏気込）</dt><dd className="text-right tabular-nums">{r.hCoef.toFixed(0)} W/K（{(r.hCoef / inp.floorArea).toFixed(2)} W/m²K）</dd>
            <dt className="text-gray-500">年間 暖房負荷</dt><dd className="text-right tabular-nums">{kwh(r.heatLoadYear)}</dd>
            <dt className="text-gray-500">年間 冷房負荷</dt><dd className="text-right tabular-nums">{kwh(r.coolLoadYear)}</dd>
            <dt className="text-gray-500">冷暖房の消費電力</dt><dd className="text-right tabular-nums">{kwh(r.loadByCat.hvac)}</dd>
          </dl>
          <p className="text-[11px] text-gray-500 mt-2">UA値・C値・ηA値を変えると冷暖房の電力と光熱費がどう変わるか比較できます。</p>
        </Card>
      </div>

      <Card title={`累積収支の推移（${inp.years}年間）`} sub={useLoan ? 'ローン返済額を差し引いた累積の手残り' : '初期費用（補助金差引）からスタートし、毎年の光熱費削減額を積み上げ。0を超えた年が回収年'}>
        <Legend items={[{ label: '太陽光のみ', color: COLORS.pv }, ...(hasBat ? [{ label: '太陽光＋蓄電池', color: COLORS.battery }] : [])]} />
        <LineChart
          labels={r.years.map(y => `${y.year}年`)}
          unit="万円"
          xEvery={5}
          zeroLine
          series={[
            { key: 'B', label: '太陽光のみ', color: COLORS.pv, values: r.years.map(y => y.cumB / 10000) },
            ...(hasBat ? [{ key: 'C', label: '太陽光＋蓄電池', color: COLORS.battery, values: r.years.map(y => y.cumC / 10000) }] : []),
          ]}
        />
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-gray-500">太陽光のみ</p>
            <p>初期費用 <b>{man(r.investB)}</b>／{useLoan ? `累積 ${man(last.cumB)}` : r.paybackB ? `回収 ${r.paybackB}年目` : '期間内未回収'}</p>
          </div>
          {hasBat && (
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-gray-500">太陽光＋蓄電池</p>
              <p>初期費用 <b>{man(r.investC)}</b>／{useLoan ? `累積 ${man(last.cumC)}` : r.paybackC ? `回収 ${r.paybackC}年目` : '期間内未回収'}</p>
            </div>
          )}
        </div>
      </Card>

      {inp.battery && (
        <Card title="蓄電池の容量比較" sub="同じ太陽光・生活条件で、蓄電池容量だけを変えた場合の年間メリット（太陽光のみとの差）">
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left py-1 font-normal">容量</th>
                  <th className="text-right font-normal">自給率</th>
                  <th className="text-right font-normal">FIT期間中の上乗せ</th>
                  <th className="text-right font-normal">卒FIT後の上乗せ</th>
                  <th className="text-right font-normal">概算費用</th>
                </tr>
              </thead>
              <tbody>
                {r.sweep.map(s => (
                  <tr key={s.kwh} className={`border-b border-gray-100 ${Math.abs(s.kwh - inp.batteryKwh) < 1.1 && s.kwh > 0 ? 'bg-orange-50' : ''}`}>
                    <td className="py-1">{s.kwh === 0 ? 'なし' : `${s.kwh} kWh`}</td>
                    <td className="text-right">{pct(s.selfSuff)}</td>
                    <td className="text-right">{s.kwh === 0 ? '—' : `${yen(s.saveFit)}/年`}</td>
                    <td className="text-right">{s.kwh === 0 ? '—' : `${yen(s.savePost)}/年`}</td>
                    <td className="text-right">{s.kwh === 0 ? '—' : man(s.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">売電単価が高いFIT期間中は蓄電池の経済効果が小さく、卒FIT後に大きくなります。費用は入力した蓄電池価格の容量比例で概算しています。</p>
        </Card>
      )}

      <Card title="月別の詳細">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] tabular-nums whitespace-nowrap">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-left py-1 font-normal">月</th>
                <th className="text-right font-normal">発電</th>
                <th className="text-right font-normal">消費</th>
                <th className="text-right font-normal">自家消費</th>
                <th className="text-right font-normal">買電</th>
                <th className="text-right font-normal">売電</th>
                <th className="text-right font-normal">電気代（なし）</th>
                <th className="text-right font-normal">電気代（導入後）</th>
                <th className="text-right font-normal">売電収入</th>
                {r.calibration.some(c => c !== null) && <th className="text-right font-normal">補正率</th>}
              </tr>
            </thead>
            <tbody>
              {r.months.map((m, i) => {
                const s = hasBat ? m.C : m.B
                return (
                  <tr key={m.month} className="border-b border-gray-100">
                    <td className="py-1">{m.month}月</td>
                    <td className="text-right">{Math.round(m.pv)}</td>
                    <td className="text-right">{Math.round(m.load)}</td>
                    <td className="text-right">{Math.round(s.self)}</td>
                    <td className="text-right">{Math.round(s.buy)}</td>
                    <td className="text-right">{Math.round(s.sell)}</td>
                    <td className="text-right">{yen(m.A.bill)}</td>
                    <td className="text-right">{yen(s.bill)}</td>
                    <td className="text-right">{yen(s.revenue)}</td>
                    {r.calibration.some(c => c !== null) && <td className="text-right">{r.calibration[i] ? `${(r.calibration[i]! * 100).toFixed(0)}%` : '—'}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">単位 kWh（電力量）</p>
      </Card>

      <Card title="年次の収支表">
        <button type="button" onClick={() => setShowYears(!showYears)} className="text-xs text-orange-600 underline print:hidden">{showYears ? '閉じる' : `${inp.years}年分を表示`}</button>
        {(showYears) && (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-[11px] tabular-nums whitespace-nowrap">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left py-1 font-normal">年</th>
                  <th className="text-right font-normal">発電量</th>
                  <th className="text-right font-normal">売電単価</th>
                  <th className="text-right font-normal">電気代（なし）</th>
                  <th className="text-right font-normal">実質電気代（太陽光）</th>
                  {hasBat && <th className="text-right font-normal">実質電気代（＋蓄電池）</th>}
                  <th className="text-right font-normal">累積（太陽光）</th>
                  {hasBat && <th className="text-right font-normal">累積（＋蓄電池）</th>}
                </tr>
              </thead>
              <tbody>
                {r.years.map(y => (
                  <tr key={y.year} className="border-b border-gray-100">
                    <td className="py-1">{y.year}</td>
                    <td className="text-right">{Math.round(y.pvKwh)}</td>
                    <td className="text-right">{y.sellPrice}</td>
                    <td className="text-right">{yen(y.costA)}</td>
                    <td className="text-right">{yen(y.netB)}</td>
                    {hasBat && <td className="text-right">{yen(y.netC)}</td>}
                    <td className={`text-right ${y.cumB < 0 ? 'text-red-600' : ''}`}>{man(y.cumB)}</td>
                    {hasBat && <td className={`text-right ${y.cumC < 0 ? 'text-red-600' : ''}`}>{man(y.cumC)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section className="text-[11px] text-gray-500 leading-relaxed bg-white rounded-xl border border-gray-200 p-4">
        <p className="font-bold text-gray-700 mb-1">計算方法と注意事項</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>1時間ごと・年間8,760時間で発電・消費・蓄電池の充放電・売買電を計算しています。</li>
          <li>発電量：月平均日射量から晴れ・曇りの日変動を生成し、傾斜面日射（Hay-Davies）・入射角・パネル温度・汚れ・配線・パワコン効率・過積載のピークカット・積雪を考慮しています。</li>
          <li>冷暖房：UA値×外皮面積＋換気・漏気（C値）による熱損失から、日射取得（ηA値）・人体・家電の発熱を差し引いて時刻別に負荷を算出し、外気温に応じたエアコン効率で電力に換算しています。</li>
          <li>給湯：給水温度の季節変化と湯量から熱量を算出し、エコキュートは沸き上げ時刻の外気温で効率を変化させています。</li>
          <li>天候・生活の変化により実際の値とは差が生じます。実績値による補正や、気象データの現地値への置き換えで精度を高められます。料金単価・売電単価・補助金は最新情報をご確認ください。</li>
        </ul>
      </section>
    </div>
  )
}
