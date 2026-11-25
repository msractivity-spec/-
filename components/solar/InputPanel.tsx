'use client'

import { Building2, Car, CloudSun, Flame, Home, Plug, Receipt, Sun, Users, Wallet, BatteryCharging, Gauge, Plus, Trash2 } from 'lucide-react'
import { CLIMATES, findClimate } from '@/lib/solar/climate'
import { RATE_PRESETS, type Inputs, type PvArray, type RatePlan } from '@/lib/solar/types'
import { NumField, SelectField, Section, Toggle, Note } from './Fields'

type Props = { inp: Inputs; set: (patch: Partial<Inputs>) => void }

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const AZIMUTHS = [
  { value: 0, label: '南' }, { value: -45, label: '南東' }, { value: 45, label: '南西' },
  { value: -90, label: '東' }, { value: 90, label: '西' }, { value: -135, label: '北東' }, { value: 135, label: '北西' }, { value: 180, label: '北' },
  { value: -15, label: '南南東(-15°)' }, { value: 15, label: '南南西(15°)' }, { value: -30, label: '南東寄り(-30°)' }, { value: 30, label: '南西寄り(30°)' },
]
const PITCHES = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10].map(v => ({
  value: v, label: `${v}寸（${(Math.atan(v / 10) * 180 / Math.PI).toFixed(1)}°）`,
}))
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${h}時` }))

function uaGrade(ua: number, zone: number) {
  // HEAT20 / 省エネ基準の目安（5〜7地域ベース、1〜4地域は別基準）
  const tbl: Record<number, [number, number, number, number]> = {
    1: [0.46, 0.28, 0.2, 0.2], 2: [0.46, 0.28, 0.2, 0.2], 3: [0.56, 0.28, 0.2, 0.2], 4: [0.75, 0.34, 0.23, 0.23],
    5: [0.87, 0.46, 0.34, 0.23], 6: [0.87, 0.46, 0.34, 0.26], 7: [0.87, 0.46, 0.34, 0.26], 8: [9, 9, 9, 9],
  }
  const [base, g1zeh, g2, g3] = tbl[zone] ?? tbl[6]
  if (zone === 8) return '8地域は基準値なし'
  if (ua <= g3) return 'HEAT20 G3 相当（断熱等級7）'
  if (ua <= g2) return 'HEAT20 G2 相当（断熱等級6）'
  if (ua <= g1zeh) return 'ZEH水準以上（断熱等級5）'
  if (ua <= base) return '省エネ基準（断熱等級4）'
  return '省エネ基準未満'
}

export default function InputPanel({ inp, set }: Props) {
  const cl = findClimate(inp.climateId)
  const temp = inp.customClimate && inp.temp.length === 12 ? inp.temp : cl.temp
  const ghi = inp.customClimate && inp.ghi.length === 12 ? inp.ghi : cl.ghi
  const snow = inp.customClimate && inp.snow.length === 12 ? inp.snow : cl.snow
  const totalKw = inp.arrays.reduce((a, r) => a + r.kw, 0)
  const persons = inp.adults + inp.children + inp.elderly
  const p = inp.plan
  const setPlan = (patch: Partial<RatePlan>) => set({ plan: { ...p, ...patch } })
  const setArray = (i: number, patch: Partial<PvArray>) => set({ arrays: inp.arrays.map((a, k) => (k === i ? { ...a, ...patch } : a)) })
  const setMonthArr = (key: 'temp' | 'ghi' | 'snow', m: number, v: number) => {
    const base = { temp, ghi, snow }
    const arr = [...base[key]]
    arr[m] = v
    set({ customClimate: true, temp: [...temp], ghi: [...ghi], snow: [...snow], [key]: arr })
  }

  return (
    <div className="space-y-3">
      <Section title="邸名・プラン" icon={<Home size={16} className="text-orange-500" />}>
        <label className="block col-span-2">
          <span className="block text-xs text-gray-600 mb-1">邸名・プラン名（印刷時に表示）</span>
          <input className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm" value={inp.projectName} placeholder="例）○○様邸 プランA" onChange={e => set({ projectName: e.target.value })} />
        </label>
      </Section>

      <Section title="地域・気象" icon={<CloudSun size={16} className="text-orange-500" />}>
        <SelectField
          full label="建設地（最寄りの観測地点）" value={inp.climateId}
          onChange={v => set({ climateId: v, customClimate: false, temp: [], ghi: [], snow: [] })}
          options={CLIMATES.map(c => ({ value: c.id, label: `${c.pref} ${c.name}（${c.zone}地域）` }))}
          hint={`緯度 ${cl.lat}° / 省エネ基準 ${cl.zone}地域 / 年平均日射 ${(ghi.reduce((a, b) => a + b, 0) / 12).toFixed(2)} kWh/m²日`}
        />
        <details className="col-span-2">
          <summary className="text-xs text-orange-600 cursor-pointer">気象データを確認・編集（現地データで精度向上）{inp.customClimate && '　※編集済み'}</summary>
          <div className="overflow-x-auto mt-2">
            <table className="text-[11px] w-full">
              <thead><tr className="text-gray-500"><th className="text-left font-normal">月</th><th className="font-normal">気温℃</th><th className="font-normal">日射kWh/m²日</th><th className="font-normal">積雪損失%</th></tr></thead>
              <tbody>
                {MONTHS.map((mn, m) => (
                  <tr key={mn}>
                    <td className="pr-1 text-gray-600">{mn}</td>
                    <td><input type="number" step={0.1} className="w-full border rounded px-1 py-0.5 text-right" value={temp[m]} onChange={e => setMonthArr('temp', m, Number(e.target.value))} /></td>
                    <td><input type="number" step={0.1} className="w-full border rounded px-1 py-0.5 text-right" value={ghi[m]} onChange={e => setMonthArr('ghi', m, Number(e.target.value))} /></td>
                    <td><input type="number" step={5} className="w-full border rounded px-1 py-0.5 text-right" value={Math.round(snow[m] * 100)} onChange={e => setMonthArr('snow', m, Number(e.target.value) / 100)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inp.customClimate && (
              <button type="button" className="mt-2 text-xs text-gray-500 underline" onClick={() => set({ customClimate: false, temp: [], ghi: [], snow: [] })}>観測地点の値に戻す</button>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">日射量はNEDO日射量データベース（MONSOLA等）の水平面全天日射量に置き換えると精度が上がります。</p>
        </details>
      </Section>

      <Section title="建物性能" icon={<Building2 size={16} className="text-orange-500" />}>
        <NumField label="延床面積" unit="m²" value={inp.floorArea} onChange={v => set({ floorArea: v })} min={20} step={0.5} hint={`${(inp.floorArea / 3.306).toFixed(1)} 坪`} />
        <SelectField label="階数" value={inp.stories} onChange={v => set({ stories: v })} options={[{ value: 1, label: '平屋' }, { value: 2, label: '2階建て' }, { value: 3, label: '3階建て' }]} />
        <NumField label="UA値（外皮平均熱貫流率）" unit="W/m²K" value={inp.ua} onChange={v => set({ ua: v })} step={0.01} min={0.1} max={2} hint={uaGrade(inp.ua, cl.zone)} />
        <NumField label="C値（相当隙間面積）" unit="cm²/m²" value={inp.cValue} onChange={v => set({ cValue: v })} step={0.1} min={0} max={15} hint={`自然漏気 約${(0.1 * inp.cValue).toFixed(2)}回/h`} />
        <NumField label="ηAC値（冷房期日射熱取得率）" value={inp.etaAC} onChange={v => set({ etaAC: v })} step={0.1} min={0} max={10} />
        <NumField label="ηAH値（暖房期日射熱取得率）" value={inp.etaAH} onChange={v => set({ etaAH: v })} step={0.1} min={0} max={10} hint="不明な場合はηAC×1.3〜1.5程度" />
        <NumField label="外皮面積（0=自動推定）" unit="m²" value={inp.envelopeArea} onChange={v => set({ envelopeArea: v })} min={0} hint="省エネ計算書の値を推奨" />
        <NumField label="平均天井高" unit="m" value={inp.ceilingHeight} onChange={v => set({ ceilingHeight: v })} step={0.05} min={2} max={5} />
        <SelectField label="換気方式" value={inp.ventType} onChange={v => set({ ventType: v, ventFanW: v === 'type1' ? 35 : 12, heatRecovery: v === 'type1' ? 80 : 0 })} options={[{ value: 'type3', label: '第3種換気' }, { value: 'type1', label: '第1種（熱交換）' }]} />
        {inp.ventType === 'type1'
          ? <NumField label="熱交換効率（温度）" unit="%" value={inp.heatRecovery} onChange={v => set({ heatRecovery: v })} min={0} max={95} />
          : <div />}
        <NumField label="換気ファン消費電力" unit="W" value={inp.ventFanW} onChange={v => set({ ventFanW: v })} min={0} />
      </Section>

      <Section title="冷暖房" icon={<Flame size={16} className="text-orange-500" />}>
        <SelectField full label="運転方法" value={inp.hvacMode} onChange={v => set({ hvacMode: v })} options={[
          { value: 'zonal', label: '個別エアコン（居室・在室時のみ）' },
          { value: 'whole', label: '全館空調・24時間連続運転' },
        ]} />
        <SelectField label="暖房の熱源" value={inp.heatSource} onChange={v => set({ heatSource: v })} options={[
          { value: 'aircon', label: 'エアコン（電気）' }, { value: 'fuel', label: 'ガス・灯油' },
        ]} />
        <NumField label="エアコンAPF" value={inp.apf} onChange={v => set({ apf: v })} step={0.1} min={2} max={9} hint="標準機 5.8 / 上位機 6.5〜7.0" />
        <NumField label="暖房設定温度" unit="℃" value={inp.heatSet} onChange={v => set({ heatSet: v })} min={14} max={26} />
        <NumField label="冷房設定温度" unit="℃" value={inp.coolSet} onChange={v => set({ coolSet: v })} min={22} max={30} />
        <Toggle label="夏の就寝時も寝室を冷房する" checked={inp.nightCooling} onChange={v => set({ nightCooling: v })} />
      </Section>

      <Section title="家族構成・生活スケジュール" icon={<Users size={16} className="text-orange-500" />}>
        <NumField label="大人（就労世代）" unit="人" value={inp.adults} onChange={v => set({ adults: v })} min={0} max={10} />
        <NumField label="子ども" unit="人" value={inp.children} onChange={v => set({ children: v })} min={0} max={10} />
        <NumField label="高齢者" unit="人" value={inp.elderly} onChange={v => set({ elderly: v })} min={0} max={10} />
        <NumField label="平日日中の在宅人数" unit="人" value={inp.daytimeHome} onChange={v => set({ daytimeHome: v })} min={0} max={persons} hint="専業主婦(夫)・高齢者・未就学児など" />
        <SelectField label="起床" value={inp.wakeHour} onChange={v => set({ wakeHour: v })} options={HOURS} />
        <SelectField label="就寝" value={inp.sleepHour} onChange={v => set({ sleepHour: v })} options={HOURS} />
        <SelectField label="平日 外出（出勤・通学）" value={inp.leaveHour} onChange={v => set({ leaveHour: v })} options={HOURS} />
        <SelectField label="平日 帰宅" value={inp.returnHour} onChange={v => set({ returnHour: v })} options={HOURS} />
        <NumField label="在宅勤務の日数" unit="日/週" value={inp.workFromHomeDays} onChange={v => set({ workFromHomeDays: v })} min={0} max={5} />
        <div className="text-xs text-gray-500 self-end pb-2">合計 {persons} 人</div>
      </Section>

      <Section title="給湯・調理・家電" icon={<Plug size={16} className="text-orange-500" />}>
        <SelectField label="給湯機" value={inp.waterHeater} onChange={v => set({ waterHeater: v })} options={[
          { value: 'ecocute', label: 'エコキュート' }, { value: 'electric', label: '電気温水器' }, { value: 'gas', label: 'ガス給湯器（エコジョーズ）' },
        ]} />
        {inp.waterHeater === 'ecocute'
          ? <NumField label="年間給湯保温効率(JIS)" value={inp.ecocuteApf} onChange={v => set({ ecocuteApf: v })} step={0.1} min={2} max={5} />
          : <div />}
        {inp.waterHeater === 'ecocute' && (
          <Toggle label="昼間に沸き上げる（太陽光連携・おひさまエコキュート等）" checked={inp.ecocuteSolarMode} onChange={v => set({ ecocuteSolarMode: v })} hint="外気温が高い昼に沸かすためCOPも向上します" />
        )}
        <NumField label="シャワー等の給湯量" unit="L/人日" value={inp.hotWaterPerPerson} onChange={v => set({ hotWaterPerPerson: v })} min={0} hint="40℃換算、浴槽湯はりを除く" />
        <NumField label="浴槽の湯はり" unit="日/週" value={inp.bathDaysPerWeek} onChange={v => set({ bathDaysPerWeek: v })} min={0} max={7} />
        <NumField label="浴槽湯量" unit="L" value={inp.bathVolume} onChange={v => set({ bathVolume: v })} min={0} />
        <SelectField label="調理" value={inp.cooking} onChange={v => set({ cooking: v })} options={[{ value: 'ih', label: 'IHクッキングヒーター' }, { value: 'gas', label: 'ガスコンロ' }]} />
        <NumField label="常時負荷（冷蔵庫・待機電力等）" unit="W" value={inp.baseLoadW} onChange={v => set({ baseLoadW: v })} min={0} />
        <NumField label="照明・家電の使用量" unit="kWh/人日" value={inp.applianceKwhPerPerson} onChange={v => set({ applianceKwhPerPerson: v })} step={0.1} min={0} hint="在宅時間に応じて自動で増減" />
        <Toggle full={false} label="食洗機" checked={inp.dishwasher} onChange={v => set({ dishwasher: v })} />
        <SelectField label="衣類乾燥" value={inp.dryer} onChange={v => set({ dryer: v })} options={[
          { value: 'none', label: 'なし' }, { value: 'heatpump', label: 'ヒートポンプ式' }, { value: 'heater', label: 'ヒーター式' },
        ]} />
        <NumField label="浴室乾燥機の使用" unit="時間/週" value={inp.bathDryerHoursPerWeek} onChange={v => set({ bathDryerHoursPerWeek: v })} min={0} />
      </Section>

      <Section title="電気自動車（EV）" icon={<Car size={16} className="text-orange-500" />} defaultOpen={inp.ev}>
        <Toggle label="EVを保有・保有予定" checked={inp.ev} onChange={v => set({ ev: v })} />
        {inp.ev && (
          <>
            <NumField label="年間走行距離" unit="km" value={inp.evKmPerYear} onChange={v => set({ evKmPerYear: v })} step={500} min={0} />
            <NumField label="電費" unit="km/kWh" value={inp.evEfficiency} onChange={v => set({ evEfficiency: v })} step={0.1} min={2} />
            <SelectField full label="充電する時間帯" value={inp.evCharge} onChange={v => set({ evCharge: v })} options={[
              { value: 'night', label: '深夜（1〜5時）' }, { value: 'evening', label: '帰宅後すぐ（19〜22時）' }, { value: 'solar', label: '昼間の太陽光で（在宅日・休日）' },
            ]} />
          </>
        )}
      </Section>

      <Section title="太陽光発電" icon={<Sun size={16} className="text-orange-500" />} badge={`${totalKw.toFixed(2)} kW`}>
        {inp.arrays.map((a, i) => (
          <div key={i} className="col-span-2 grid grid-cols-2 gap-x-3 gap-y-2 border border-gray-200 rounded-lg p-2.5">
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">屋根面 {i + 1}</span>
              {inp.arrays.length > 1 && (
                <button type="button" onClick={() => set({ arrays: inp.arrays.filter((_, k) => k !== i) })} className="text-gray-400 hover:text-red-500" aria-label="削除"><Trash2 size={14} /></button>
              )}
            </div>
            <NumField label="パネル容量" unit="kW" value={a.kw} onChange={v => setArray(i, { kw: v })} step={0.01} min={0} />
            <SelectField label="方位" value={a.azimuth} onChange={v => setArray(i, { azimuth: v })} options={AZIMUTHS.some(o => o.value === a.azimuth) ? AZIMUTHS : [...AZIMUTHS, { value: a.azimuth, label: `${a.azimuth}°` }]} />
            <SelectField label="屋根勾配" value={a.pitchSun} onChange={v => setArray(i, { pitchSun: v })} options={PITCHES} />
            <NumField label="影による損失" unit="%" value={a.shade} onChange={v => setArray(i, { shade: v })} min={0} max={90} />
          </div>
        ))}
        {inp.arrays.length < 4 && (
          <button type="button" onClick={() => set({ arrays: [...inp.arrays, { kw: 2, azimuth: 90, pitchSun: inp.arrays[0]?.pitchSun ?? 4, shade: 0 }] })} className="col-span-2 flex items-center justify-center gap-1 text-xs text-orange-600 border border-dashed border-orange-300 rounded-lg py-2">
            <Plus size={14} /> 屋根面を追加（切妻の東西面など）
          </button>
        )}
        <SelectField label="パネル種類" value={inp.moduleType} onChange={v => set({ moduleType: v })} options={[
          { value: 'mono', label: '単結晶（-0.35%/℃）' }, { value: 'hjt', label: 'HJT等 高温に強い（-0.26%/℃）' }, { value: 'poly', label: '多結晶（-0.41%/℃）' },
        ]} />
        <NumField label="パワコン定格出力" unit="kW" value={inp.pcsKw} onChange={v => set({ pcsKw: v })} step={0.1} min={0.5} hint={totalKw > inp.pcsKw ? `過積載率 ${((totalKw / inp.pcsKw) * 100).toFixed(0)}%` : undefined} />
        <NumField label="パワコン変換効率" unit="%" value={inp.pcsEff} onChange={v => set({ pcsEff: v })} step={0.5} min={80} max={99} />
        <NumField label="汚れ損失" unit="%" value={inp.soiling} onChange={v => set({ soiling: v })} step={0.5} min={0} max={20} />
        <NumField label="配線・ミスマッチ等損失" unit="%" value={inp.wiring} onChange={v => set({ wiring: v })} step={0.5} min={0} max={20} />
        <NumField label="経年劣化率" unit="%/年" value={inp.pvDegradation} onChange={v => set({ pvDegradation: v })} step={0.1} min={0} max={3} />
      </Section>

      <Section title="蓄電池" icon={<BatteryCharging size={16} className="text-orange-500" />} badge={inp.battery ? `${inp.batteryKwh} kWh` : 'なし'}>
        <Toggle label="蓄電池を設置する" checked={inp.battery} onChange={v => set({ battery: v })} />
        {inp.battery && (
          <>
            <NumField label="蓄電容量（公称）" unit="kWh" value={inp.batteryKwh} onChange={v => set({ batteryKwh: v })} step={0.1} min={0} />
            <NumField label="実効容量" unit="%" value={inp.batteryUsable} onChange={v => set({ batteryUsable: v })} min={50} max={100} hint={`使用可能 ${(inp.batteryKwh * inp.batteryUsable / 100).toFixed(1)} kWh`} />
            <NumField label="最大充放電出力" unit="kW" value={inp.batteryKw} onChange={v => set({ batteryKw: v })} step={0.1} min={0.5} />
            <NumField label="充放電効率（往復）" unit="%" value={inp.batteryEff} onChange={v => set({ batteryEff: v })} min={60} max={99} />
            <NumField label="待機電力" unit="W" value={inp.batteryStandbyW} onChange={v => set({ batteryStandbyW: v })} min={0} hint="メーカー仕様書で確認" />
            <NumField label="10年後の容量維持率" unit="%" value={inp.batteryRetention10y} onChange={v => set({ batteryRetention10y: v })} min={40} max={100} />
            <SelectField full label="運転モード" value={inp.batteryMode} onChange={v => set({ batteryMode: v })} options={[
              { value: 'green', label: 'グリーンモード（余剰を貯めて夜に使う）' },
              { value: 'economy', label: '経済モード（深夜電力で充電し昼夜に放電）' },
              { value: 'smart', label: 'AI予測モード（翌日の発電・消費を見て深夜充電量を最適化）' },
            ]} hint={inp.batteryMode !== 'green' && p.type === 'tiered' ? '※従量電灯プランでは深夜充電のメリットはありません' : undefined} />
            {inp.batteryMode === 'economy' && (
              <NumField label="深夜の充電目標" unit="%" value={inp.batteryNightTarget} onChange={v => set({ batteryNightTarget: v })} min={0} max={100} />
            )}
            <NumField label="停電用の残量確保" unit="%" value={inp.batteryReserve} onChange={v => set({ batteryReserve: v })} min={0} max={100} />
            <NumField label="停電時に使う電力（特定負荷）" unit="W" value={inp.backupLoadW} onChange={v => set({ backupLoadW: v })} min={50} step={50} hint="冷蔵庫+照明+通信で300〜500W" />
          </>
        )}
      </Section>

      <Section title="電力プラン・売電" icon={<Receipt size={16} className="text-orange-500" />}>
        <SelectField full label="プランのひな型" value={RATE_PRESETS.findIndex(r => r.name === p.name)} onChange={v => v >= 0 && set({ plan: { ...RATE_PRESETS[v] } })}
          options={[...RATE_PRESETS.map((r, i) => ({ value: i, label: r.name })), { value: -1, label: 'カスタム（下で編集）' }]}
          hint="単価は目安です。最新の料金表・検針票で必ず確認・修正してください" />
        <SelectField label="料金体系" value={p.type} onChange={v => setPlan({ type: v, name: 'カスタム' })} options={[{ value: 'tiered', label: '従量電灯（3段階）' }, { value: 'tou', label: '時間帯別' }]} />
        <NumField label="基本料金" unit="円/月" value={p.basic} onChange={v => setPlan({ basic: v, name: 'カスタム' })} step={0.01} min={0} />
        {p.type === 'tiered' ? (
          <>
            <NumField label="第1段階 単価" unit="円/kWh" value={p.tier1} onChange={v => setPlan({ tier1: v, name: 'カスタム' })} step={0.01} />
            <NumField label="第1段階 上限" unit="kWh" value={p.tier1Limit} onChange={v => setPlan({ tier1Limit: v, name: 'カスタム' })} />
            <NumField label="第2段階 単価" unit="円/kWh" value={p.tier2} onChange={v => setPlan({ tier2: v, name: 'カスタム' })} step={0.01} />
            <NumField label="第2段階 上限" unit="kWh" value={p.tier2Limit} onChange={v => setPlan({ tier2Limit: v, name: 'カスタム' })} />
            <NumField label="第3段階 単価" unit="円/kWh" value={p.tier3} onChange={v => setPlan({ tier3: v, name: 'カスタム' })} step={0.01} />
          </>
        ) : (
          <>
            <NumField label="デイ（昼間）単価" unit="円/kWh" value={p.dayRate} onChange={v => setPlan({ dayRate: v, name: 'カスタム' })} step={0.01} />
            <NumField label="ナイト（夜間）単価" unit="円/kWh" value={p.nightRate} onChange={v => setPlan({ nightRate: v, name: 'カスタム' })} step={0.01} />
            <SelectField label="夜間 開始" value={p.nightStart} onChange={v => setPlan({ nightStart: v, name: 'カスタム' })} options={HOURS} />
            <SelectField label="夜間 終了" value={p.nightEnd} onChange={v => setPlan({ nightEnd: v, name: 'カスタム' })} options={HOURS} />
            <NumField label="ピーク単価（0=なし）" unit="円/kWh" value={p.peakRate} onChange={v => setPlan({ peakRate: v, name: 'カスタム' })} step={0.01} />
            <div />
            {p.peakRate > 0 && (
              <>
                <SelectField label="ピーク 開始" value={p.peakStart} onChange={v => setPlan({ peakStart: v, name: 'カスタム' })} options={HOURS} />
                <SelectField label="ピーク 終了" value={p.peakEnd} onChange={v => setPlan({ peakEnd: v, name: 'カスタム' })} options={HOURS} />
                <Toggle label="ピークは夏季（7〜9月）平日のみ" checked={p.peakSummerOnly} onChange={v => setPlan({ peakSummerOnly: v, name: 'カスタム' })} />
              </>
            )}
            <Toggle label="土日祝は終日ナイト料金" checked={p.weekendNight} onChange={v => setPlan({ weekendNight: v, name: 'カスタム' })} />
          </>
        )}
        <NumField label="燃料費調整額" unit="円/kWh" value={p.fuelAdj} onChange={v => setPlan({ fuelAdj: v, name: 'カスタム' })} step={0.01} hint="検針票の値（マイナスもあり）" />
        <NumField label="再エネ賦課金" unit="円/kWh" value={p.renewLevy} onChange={v => setPlan({ renewLevy: v, name: 'カスタム' })} step={0.01} />
        <NumField label="売電単価 1〜4年目" unit="円/kWh" value={inp.sellFit1} onChange={v => set({ sellFit1: v })} step={0.1} hint="FIT 初期投資支援スキーム" />
        <NumField label="売電単価 5〜10年目" unit="円/kWh" value={inp.sellFit2} onChange={v => set({ sellFit2: v })} step={0.1} />
        <NumField label="売電単価 11年目以降（卒FIT）" unit="円/kWh" value={inp.sellPost} onChange={v => set({ sellPost: v })} step={0.1} />
        <NumField label="電気料金の上昇率" unit="%/年" value={inp.priceEscalation} onChange={v => set({ priceEscalation: v })} step={0.5} />
        <NumField label="ガス単価" unit="円/m³" value={inp.gasPrice} onChange={v => set({ gasPrice: v })} hint="ガス機器がある場合" />
        <NumField label="ガス基本料金" unit="円/月" value={inp.gasBasic} onChange={v => set({ gasBasic: v })} />
      </Section>

      <Section title="実績データで補正" icon={<Gauge size={16} className="text-orange-500" />} defaultOpen={false} badge={inp.actualMonthly.some(v => v > 0) ? '補正中' : undefined}>
        <Note>
          同じ家族の現在の検針票（月別使用量 kWh）を入力すると、その月の計算値を実績に合わせて補正します（入力のない月は入力月の平均補正率を使用）。
          住み替えで住宅性能が大きく変わる場合は、補正せずに計算値を使うか「全体補正」で調整してください。
        </Note>
        {MONTHS.map((mn, m) => (
          <NumField key={mn} label={`${mn} 実績`} unit="kWh" value={inp.actualMonthly[m]} min={0}
            onChange={v => set({ actualMonthly: inp.actualMonthly.map((x, k) => (k === m ? v : x)) })} />
        ))}
        <NumField full label="全体補正（消費電力量の倍率）" unit="%" value={inp.loadAdjust} onChange={v => set({ loadAdjust: v })} min={30} max={300} />
      </Section>

      <Section title="費用・経済条件" icon={<Wallet size={16} className="text-orange-500" />}>
        <NumField label="太陽光 単価（税込）" unit="円/kW" value={inp.pvCostPerKw} onChange={v => set({ pvCostPerKw: v })} step={10000} min={0} hint={`太陽光 総額 ${Math.round(totalKw * inp.pvCostPerKw / 10000)} 万円`} />
        <NumField label="太陽光 補助金" unit="円" value={inp.pvSubsidy} onChange={v => set({ pvSubsidy: v })} step={10000} min={0} />
        <NumField label="蓄電池 価格（税込・工事込）" unit="円" value={inp.batteryCost} onChange={v => set({ batteryCost: v })} step={10000} min={0} />
        <NumField label="蓄電池 補助金" unit="円" value={inp.batterySubsidy} onChange={v => set({ batterySubsidy: v })} step={10000} min={0} hint="DR補助金・自治体補助など" />
        <NumField label="メンテナンス費" unit="円/年" value={inp.maintenancePerYear} onChange={v => set({ maintenancePerYear: v })} step={1000} min={0} />
        <NumField label="シミュレーション期間" unit="年" value={inp.years} onChange={v => set({ years: Math.round(v) })} min={10} max={40} />
        <NumField label="パワコン交換の年" unit="年目" value={inp.pcsReplaceYear} onChange={v => set({ pcsReplaceYear: Math.round(v) })} min={0} max={40} />
        <NumField label="パワコン交換費" unit="円" value={inp.pcsReplaceCost} onChange={v => set({ pcsReplaceCost: v })} step={10000} min={0} />
        <NumField label="住宅ローン金利（0=現金）" unit="%" value={inp.loanRate} onChange={v => set({ loanRate: v })} step={0.05} min={0} max={10} hint="ローンに組み込む場合の毎年の返済額で収支を計算" />
        <NumField label="ローン期間" unit="年" value={inp.loanYears} onChange={v => set({ loanYears: Math.round(v) })} min={1} max={50} />
        <NumField label="CO₂排出係数" unit="kg/kWh" value={inp.co2Factor} onChange={v => set({ co2Factor: v })} step={0.01} min={0} />
      </Section>
    </div>
  )
}
