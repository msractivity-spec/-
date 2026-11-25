// 太陽光・蓄電池 導入効果シミュレーション エンジン
// 1時間ごと（年間8,760時間）に「発電量」「消費電力量」「蓄電池の充放電」「売買電」を計算する。
//
// 発電: 月平均日射量 → 日別の晴れ/曇り変動を生成（Collares-Pereira & Rabl で時刻別へ分配）
//       → Erbs モデルで直達/散乱分離 → Hay-Davies モデルで傾斜面日射量
//       → 入射角損失・セル温度（NOCT）・各種損失・パワコン効率/定格クリップ・積雪損失
// 消費: 冷暖房（UA値・C値・換気・日射取得・内部発熱から時刻別熱負荷 → 外気温依存COP）
//       給湯（給水温度・湯量・エコキュートの外気温依存COP・沸き上げ時間帯）
//       調理・照明家電・常時負荷・EV を家族構成と在宅スケジュールで時刻配分
// 実績補正: 月別の実績使用量が入力された場合はその月の消費をスケーリング

import { findClimate } from './climate'
import type { Inputs, RatePlan } from './types'

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const GSC = 1367 // 太陽定数 W/m²
const RAD = Math.PI / 180
const REAL_USE = 0.85 // エアコンの実使用効率（カタログAPFに対する実測比の目安）

export type LoadCat = 'hvac' | 'water' | 'cooking' | 'appliance' | 'base' | 'ev'
export const LOAD_CATS: { key: LoadCat; label: string }[] = [
  { key: 'hvac', label: '冷暖房' },
  { key: 'water', label: '給湯' },
  { key: 'cooking', label: '調理' },
  { key: 'appliance', label: '照明・家電' },
  { key: 'base', label: '常時負荷・換気' },
  { key: 'ev', label: 'EV充電' },
]

export type HourlyFlow = {
  load: Float64Array
  pv: Float64Array
  buy: Float64Array
  sell: Float64Array
  charge: Float64Array // 蓄電池へ充電（電力側 kWh）
  discharge: Float64Array // 蓄電池から放電（電力側 kWh）
  soc: Float64Array // 時刻終了時の残量 kWh
}

export type MonthRow = {
  month: number
  load: number
  pv: number
  loadByCat: Record<LoadCat, number>
  heatLoad: number // 暖房熱負荷 kWh
  coolLoad: number // 冷房熱負荷 kWh
  gasM3: number
  A: { buy: number; bill: number }
  B: { buy: number; sell: number; self: number; bill: number; revenue: number }
  C: { buy: number; sell: number; self: number; bill: number; revenue: number; charge: number; discharge: number }
}

export type YearRow = {
  year: number
  pvKwh: number
  costA: number // 導入なし 電気代
  netB: number // 太陽光のみ 電気代 − 売電収入
  netC: number // 太陽光+蓄電池
  saveB: number // 年間メリット（メンテ・交換費控除後）
  saveC: number
  cumB: number // 累積収支（初期費用 or ローン返済を含む）
  cumC: number
  sellPrice: number
}

export type SweepRow = { kwh: number; selfSuff: number; saveFit: number; savePost: number; cost: number }

export type SimResult = {
  totalKw: number
  pvYear1: number
  specificYield: number // kWh/kW
  loadYear: number
  loadByCat: Record<LoadCat, number>
  heatLoadYear: number
  coolLoadYear: number
  hCoef: number // 熱損失係数 W/K（換気・漏気込み）
  envelopeArea: number
  infiltrationAch: number
  months: MonthRow[]
  years: YearRow[]
  flowB: HourlyFlow
  flowC: HourlyFlow | null
  loadHourByCat: Record<LoadCat, Float64Array>
  dayKt: Float64Array
  tempHour: Float64Array
  investB: number
  investC: number
  paybackB: number | null
  paybackC: number | null
  annualA: number
  annualB: number
  annualC: number
  selfConsB: number
  selfConsC: number
  selfSuffB: number
  selfSuffC: number
  co2Year: number
  backupFullHours: number
  backupEveningHours: number
  gasYearCost: number
  calibration: (number | null)[]
  sweep: SweepRow[]
}

// ---------- ユーティリティ ----------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function monthOfDay(d: number) {
  let m = 0
  let acc = 0
  while (m < 11 && d >= acc + DAYS_IN_MONTH[m]) {
    acc += DAYS_IN_MONTH[m]
    m++
  }
  return m
}

export function dayIndex(month: number, date: number) {
  let acc = 0
  for (let m = 0; m < month; m++) acc += DAYS_IN_MONTH[m]
  return acc + date - 1
}

// 計算用カレンダー（2027年：1/1 金曜）
const HOLIDAYS = new Set<number>([
  dayIndex(0, 1), dayIndex(0, 2), dayIndex(0, 3), dayIndex(0, 11), dayIndex(1, 11), dayIndex(1, 23),
  dayIndex(2, 22), dayIndex(3, 29), dayIndex(4, 3), dayIndex(4, 4), dayIndex(4, 5), dayIndex(6, 19),
  dayIndex(7, 11), dayIndex(7, 13), dayIndex(7, 14), dayIndex(7, 16), dayIndex(8, 20), dayIndex(8, 23),
  dayIndex(9, 11), dayIndex(10, 3), dayIndex(10, 23), dayIndex(11, 29), dayIndex(11, 30), dayIndex(11, 31),
])
export function dayOfWeek(d: number) {
  return (5 + d) % 7 // 0=日
}
export function isHoliday(d: number) {
  const w = dayOfWeek(d)
  return w === 0 || w === 6 || HOLIDAYS.has(d)
}

function inWindow(h: number, start: number, end: number) {
  // [start, end) 24時間で折り返し対応
  if (start === end) return false
  return start < end ? h >= start && h < end : h >= start || h < end
}

export function buyRate(plan: RatePlan, d: number, h: number, month: number): number {
  if (plan.type === 'tiered') return 0 // 段階料金は月単位で計算
  const holiday = isHoliday(d)
  if (plan.weekendNight && holiday) return plan.nightRate
  if (inWindow(h, plan.nightStart, plan.nightEnd)) return plan.nightRate
  if (plan.peakRate > 0 && inWindow(h, plan.peakStart, plan.peakEnd)) {
    if (!plan.peakSummerOnly || (month >= 6 && month <= 8 && !holiday)) return plan.peakRate
  }
  return plan.dayRate
}

function isNightHour(plan: RatePlan, d: number, h: number) {
  if (plan.type === 'tiered') return h >= 1 && h < 6
  return inWindow(h, plan.nightStart, plan.nightEnd)
}

// ---------- 気象・発電 ----------

type Weather = {
  ghi: Float64Array // W/m² (1時間平均)
  dhi: Float64Array
  temp: Float64Array
  cosZ: Float64Array
  sunData: { decl: Float64Array; omega: Float64Array }
  dayKt: Float64Array
}

function buildWeather(inp: Inputs): Weather {
  const cl = findClimate(inp.climateId)
  const temp = inp.customClimate && inp.temp.length === 12 ? inp.temp : cl.temp
  const ghiM = inp.customClimate && inp.ghi.length === 12 ? inp.ghi : cl.ghi
  const lat = cl.lat * RAD
  const rnd = mulberry32(hashStr(cl.id) + 7)

  const ghi = new Float64Array(8760)
  const dhi = new Float64Array(8760)
  const tHour = new Float64Array(8760)
  const cosZ = new Float64Array(8760)
  const decl = new Float64Array(365)
  const omegaArr = new Float64Array(8760)
  const dayKt = new Float64Array(365)
  const H0 = new Float64Array(365)
  const ws = new Float64Array(365)

  for (let d = 0; d < 365; d++) {
    const n = d + 1
    const dl = 23.45 * RAD * Math.sin((2 * Math.PI * (284 + n)) / 365)
    decl[d] = dl
    const w = Math.acos(clamp(-Math.tan(lat) * Math.tan(dl), -1, 1))
    ws[d] = w
    const e0 = 1 + 0.033 * Math.cos((2 * Math.PI * n) / 365)
    H0[d] = (24 / Math.PI) * GSC * e0 * (Math.cos(lat) * Math.cos(dl) * Math.sin(w) + w * Math.sin(lat) * Math.sin(dl))
  }

  // 日別の晴天指数（AR(1)で連続性を持たせ、月平均に合わせて正規化）
  let z = 0
  let dStart = 0
  for (let m = 0; m < 12; m++) {
    const nd = DAYS_IN_MONTH[m]
    let h0sum = 0
    for (let i = 0; i < nd; i++) h0sum += H0[dStart + i]
    const target = (ghiM[m] * 1000 * nd) / h0sum // 月平均 Kt
    const raw: number[] = []
    for (let i = 0; i < nd; i++) {
      const g = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd())
      z = 0.35 * z + Math.sqrt(1 - 0.35 * 0.35) * g
      raw.push(target * (1 + 0.42 * z))
    }
    let scale = 1
    for (let it = 0; it < 6; it++) {
      let sum = 0
      for (let i = 0; i < nd; i++) sum += clamp(raw[i] * scale, 0.06, 0.76) * H0[dStart + i]
      scale *= (ghiM[m] * 1000 * nd) / sum
    }
    for (let i = 0; i < nd; i++) dayKt[dStart + i] = clamp(raw[i] * scale, 0.06, 0.76)
    dStart += nd
  }

  // 日平均気温（月中央で線形補間）と日較差
  const midDay: number[] = []
  {
    let acc = 0
    for (let m = 0; m < 12; m++) {
      midDay.push(acc + DAYS_IN_MONTH[m] / 2)
      acc += DAYS_IN_MONTH[m]
    }
  }
  const dailyMean = (d: number) => {
    let m1 = 11
    for (let m = 0; m < 12; m++) if (d >= midDay[m]) m1 = m
    let m2 = (m1 + 1) % 12
    let a = midDay[m1]
    let b = m2 === 0 ? midDay[0] + 365 : midDay[m2]
    let x = d
    if (d < midDay[0]) {
      m2 = 0
      a = midDay[11] - 365
      b = midDay[0]
      return temp[11] + ((temp[0] - temp[11]) * (x - a)) / (b - a)
    }
    if (x < a) x += 365
    return temp[m1] + ((temp[m2] - temp[m1]) * (x - a)) / (b - a)
  }

  const eotLonShift = (d: number) => {
    const B = (2 * Math.PI * (d - 81)) / 364
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B) // 分
    return (4 * (cl.lon - 135) + eot) / 60 // 時間
  }

  // 気温の日別ゆらぎ（晴れの日は冬に冷え込み・夏に暑くなる）
  for (let d = 0; d < 365; d++) {
    const m = monthOfDay(d)
    const ktRel = dayKt[d] / Math.max(0.2, ghiM[m] * 1000 / (H0[d] || 1))
    const tm = dailyMean(d) + (temp[m] > 18 ? 1.2 : -0.8) * (ktRel - 1)
    const amp = 2.2 + 5.5 * dayKt[d]
    const shift = eotLonShift(d)
    const dl = decl[d]
    // 日射の時刻配分
    const w = ws[d]
    const a = 0.409 + 0.5016 * Math.sin(w - 60 * RAD)
    const b = 0.6609 - 0.4767 * Math.sin(w - 60 * RAD)
    const Hd = dayKt[d] * H0[d]
    const hourly: number[] = []
    let rsum = 0
    for (let h = 0; h < 24; h++) {
      const solarTime = h + 0.5 + shift
      const om = (solarTime - 12) * 15 * RAD
      const idx = d * 24 + h
      omegaArr[idx] = om
      const cz = Math.sin(lat) * Math.sin(dl) + Math.cos(lat) * Math.cos(dl) * Math.cos(om)
      cosZ[idx] = cz
      let rt = 0
      if (cz > 0.0) rt = (Math.PI / 24) * (a + b * Math.cos(om)) * ((Math.cos(om) - Math.cos(w)) / (Math.sin(w) - w * Math.cos(w)))
      rt = Math.max(0, rt)
      hourly.push(rt)
      rsum += rt
      tHour[idx] = tm + amp * Math.cos((2 * Math.PI * (h - 14)) / 24)
    }
    const e0 = 1 + 0.033 * Math.cos((2 * Math.PI * (d + 1)) / 365)
    for (let h = 0; h < 24; h++) {
      const idx = d * 24 + h
      const I = rsum > 0 ? (hourly[h] / rsum) * Hd : 0
      ghi[idx] = I
      const I0 = GSC * e0 * Math.max(0.0, cosZ[idx])
      const kt = I0 > 1 ? clamp(I / I0, 0, 1) : 0
      let fd: number
      if (kt <= 0.22) fd = 1 - 0.09 * kt
      else if (kt <= 0.8) fd = 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4
      else fd = 0.165
      dhi[idx] = I * fd
    }
  }

  return { ghi, dhi, temp: tHour, cosZ, sunData: { decl, omega: omegaArr }, dayKt }
}

const TEMP_COEF = { mono: -0.0035, hjt: -0.0026, poly: -0.0041 }

function buildPv(inp: Inputs, wx: Weather, snowM: number[]): Float64Array {
  const cl = findClimate(inp.climateId)
  const lat = cl.lat * RAD
  const ac = new Float64Array(8760)
  const dc = new Float64Array(8760)
  const coef = TEMP_COEF[inp.moduleType]
  const commonLoss = (1 - inp.soiling / 100) * (1 - inp.wiring / 100)
  for (const arr of inp.arrays) {
    if (arr.kw <= 0) continue
    const beta = Math.atan(arr.pitchSun / 10)
    const gam = arr.azimuth * RAD
    const snowFactor = clamp(1.2 - beta / RAD / 40, 0.3, 1)
    for (let d = 0; d < 365; d++) {
      const m = monthOfDay(d)
      const dl = wx.sunData.decl[d]
      const e0 = 1 + 0.033 * Math.cos((2 * Math.PI * (d + 1)) / 365)
      const snowLoss = clamp(snowM[m] * snowFactor, 0, 1)
      for (let h = 0; h < 24; h++) {
        const i = d * 24 + h
        const G = wx.ghi[i]
        if (G <= 0) continue
        const om = wx.sunData.omega[i]
        const cz = Math.max(0.087, wx.cosZ[i])
        const cosT =
          Math.sin(dl) * Math.sin(lat) * Math.cos(beta) -
          Math.sin(dl) * Math.cos(lat) * Math.sin(beta) * Math.cos(gam) +
          Math.cos(dl) * Math.cos(lat) * Math.cos(beta) * Math.cos(om) +
          Math.cos(dl) * Math.sin(lat) * Math.sin(beta) * Math.cos(gam) * Math.cos(om) +
          Math.cos(dl) * Math.sin(beta) * Math.sin(gam) * Math.sin(om)
        const Ib = Math.max(0, G - wx.dhi[i])
        const Id = wx.dhi[i]
        const Rb = wx.cosZ[i] > 0 ? clamp(Math.max(0, cosT) / cz, 0, 5) : 0
        const I0 = GSC * e0 * cz
        const Ai = clamp(Ib / I0, 0, 1)
        const iam = cosT > 0 ? clamp(1 - 0.05 * (1 / Math.max(cosT, 0.05) - 1), 0, 1) : 0
        const poaBeam = Ib * Rb * iam
        const poaDiff = Id * ((1 - Ai) * (1 + Math.cos(beta)) / 2 + Ai * Rb * iam) * 0.96
        const poaGnd = 0.2 * G * (1 - Math.cos(beta)) / 2 * 0.9
        const poa = poaBeam + poaDiff + poaGnd
        const tc = wx.temp[i] + (poa / 800) * (48 - 20)
        // 低照度時の効率低下（簡易）
        const lowLight = poa < 200 ? 1 - 0.04 * (1 - poa / 200) : 1
        const p = (arr.kw * poa) / 1000 * (1 + coef * (tc - 25)) * lowLight * commonLoss * (1 - arr.shade / 100) * (1 - snowLoss)
        dc[i] += Math.max(0, p)
      }
    }
  }
  const eff = inp.pcsEff / 100
  for (let i = 0; i < 8760; i++) ac[i] = Math.min(dc[i] * eff, inp.pcsKw)
  return ac
}

// ---------- 消費電力 ----------

type LoadResult = {
  total: Float64Array
  byCat: Record<LoadCat, Float64Array>
  heat: Float64Array
  cool: Float64Array
  gasM3: number[]
  hCoef: number
  envelopeArea: number
  nInf: number
  calibration: (number | null)[]
}

function buildLoad(inp: Inputs, wx: Weather, monthTemp: number[]): LoadResult {
  const byCat: Record<LoadCat, Float64Array> = {
    hvac: new Float64Array(8760), water: new Float64Array(8760), cooking: new Float64Array(8760),
    appliance: new Float64Array(8760), base: new Float64Array(8760), ev: new Float64Array(8760),
  }
  const heat = new Float64Array(8760)
  const cool = new Float64Array(8760)
  const gasM3 = new Array(12).fill(0)
  const GAS_KWH_PER_M3 = 12.5 // 都市ガス 45MJ/m³

  const persons = Math.max(1, inp.adults + inp.children + inp.elderly)
  const weighted = inp.adults + inp.children * 0.8 + inp.elderly * 0.9
  const awake = (h: number) => (inp.sleepHour > inp.wakeHour ? h >= inp.wakeHour && h < inp.sleepHour : h >= inp.wakeHour || h < inp.sleepHour)

  // 在宅人数（起きている人）
  const homeAwake = (d: number, h: number) => {
    if (!awake(h)) return 0
    const holiday = isHoliday(d)
    if (holiday) {
      if (h >= 10 && h < 16) return persons * 0.6
      return persons
    }
    const wd = dayOfWeek(d) // 1=月
    const wfh = wd >= 1 && wd <= inp.workFromHomeDays ? 1 : 0
    if (inWindow(h, inp.leaveHour, inp.returnHour)) {
      return Math.min(persons, inp.daytimeHome + wfh + inp.elderly * 0)
    }
    return persons
  }
  const asleepCount = (h: number) => (awake(h) ? 0 : persons)

  // --- 建物の熱特性 ---
  const envArea = inp.envelopeArea > 0 ? inp.envelopeArea : inp.floorArea * (inp.stories === 1 ? 3.1 : inp.stories === 2 ? 2.55 : 2.3)
  const vol = inp.floorArea * inp.ceilingHeight
  const nInf = clamp(0.1 * inp.cValue, 0.02, 1.2)
  const recov = inp.ventType === 'type1' ? clamp(inp.heatRecovery / 100, 0, 0.95) : 0
  const H = inp.ua * envArea + 0.335 * vol * (nInf + 0.5 * (1 - recov)) // W/K
  const zoneFrac = inp.hvacMode === 'whole' ? 1 : 0.6

  // 給湯の沸き上げ時間帯
  const plan = inp.plan
  const ecoHours: number[] = []
  if (inp.ecocuteSolarMode) ecoHours.push(10, 11, 12, 13, 14)
  else {
    const end = plan.type === 'tou' ? plan.nightEnd : 6
    for (let k = 5; k >= 1; k--) ecoHours.push((end - k + 24) % 24)
  }

  let prevHvacOn = false
  for (let d = 0; d < 365; d++) {
    const m = monthOfDay(d)
    let dayMean = 0
    let ghiDay = 0
    for (let h = 0; h < 24; h++) {
      dayMean += wx.temp[d * 24 + h] / 24
      ghiDay += wx.ghi[d * 24 + h] / 24
    }

    // --- 照明・家電 ---
    let personHours = 0
    const shape: number[] = []
    for (let h = 0; h < 24; h++) {
      const n = homeAwake(d, h)
      personHours += n
      const w = n * (1 + (h >= 17 && h < 23 ? 0.9 : 0) + (h >= 5 && h < 8 ? 0.3 : 0))
      shape.push(w)
    }
    const shapeSum = shape.reduce((a, b) => a + b, 0) || 1
    const appDay = inp.applianceKwhPerPerson * (0.5 * weighted + (0.5 * personHours * (weighted / persons)) / 12)
    const extra = new Array(24).fill(0)
    if (inp.dishwasher) extra[21] += 0.75
    if (inp.dryer === 'heatpump') { extra[22] += 0.4; extra[23] += 0.3 }
    if (inp.dryer === 'heater') { extra[22] += 1.2; extra[23] += 1.0 }
    if (inp.bathDryerHoursPerWeek > 0) {
      const kwh = (1.3 * inp.bathDryerHoursPerWeek) / 7
      extra[22] += kwh * 0.5; extra[23] += kwh * 0.5
    }
    // 洗濯機（日中在宅 or 休日は日中、それ以外は朝）
    extra[isHoliday(d) || inp.daytimeHome > 0 ? 10 : 7] += 0.08 * persons

    // --- 調理 ---
    const cookDay = 0.35 * weighted
    const lunchHome = homeAwake(d, 12) / persons
    const cookShape = [
      [7, 0.22], [12, 0.18 * lunchHome], [18, 0.42], [19, 0.18],
    ] as const
    const cookShapeSum = cookShape.reduce((a, [, v]) => a + v, 0)

    // --- 給湯 ---
    const tw = Math.max(5, 0.8 * monthTemp[m] + 3)
    const showerL = inp.hotWaterPerPerson * (inp.adults + inp.elderly + inp.children * 0.8)
    const bathL = (inp.bathVolume * inp.bathDaysPerWeek) / 7
    const heatKwh = (showerL * (40 - tw) + bathL * (42 - tw)) * 4.186 / 3600 + (0.8 * inp.bathDaysPerWeek) / 7

    for (let h = 0; h < 24; h++) {
      const i = d * 24 + h
      const ta = wx.temp[i]
      // 常時負荷
      byCat.base[i] = (inp.baseLoadW + inp.ventFanW) / 1000
      // 家電
      const app = (appDay * shape[h]) / shapeSum + extra[h]
      byCat.appliance[i] = app
      // 調理
      let cook = 0
      for (const [ch, v] of cookShape) if (ch === h) cook = (cookDay * v) / cookShapeSum
      if (inp.cooking === 'ih') byCat.cooking[i] = cook
      else gasM3[m] += (cook * 1.8) / GAS_KWH_PER_M3

      // 給湯
      if (inp.waterHeater === 'ecocute') {
        const isHeatHour = ecoHours.includes(h)
        let part = isHeatHour ? (heatKwh * 0.85) / ecoHours.length : 0
        if (h >= 19 && h < 22) part += (heatKwh * 0.15) / 3 // 追い焚き・追加沸き上げ
        if (part > 0) {
          const cop = inp.ecocuteApf * clamp(0.72 + 0.02 * ta, 0.5, 1.35)
          byCat.water[i] = part / cop
        }
      } else if (inp.waterHeater === 'electric') {
        if (ecoHours.includes(h)) byCat.water[i] = heatKwh / 0.85 / ecoHours.length
      } else if (h === 12) {
        gasM3[m] += heatKwh / 0.87 / GAS_KWH_PER_M3 // 潜熱回収型 給湯器 効率
      }

      // 冷暖房
      const occ = homeAwake(d, h)
      const sleepers = asleepCount(h)
      const internalW = occ * 80 + sleepers * 60 + (app + cook + byCat.base[i]) * 1000 * 0.8
      const isHeatSeason = dayMean < 16.5 && ta < inp.heatSet
      const isCoolSeason = dayMean >= 21 || ta >= 26
      const eta = isHeatSeason ? inp.etaAH : inp.etaAC
      const solarW = (eta / 100) * envArea * (0.5 * wx.ghi[i] + 0.5 * ghiDay)
      let operate = 0 // 運転率（面積比）
      let tSet = 0
      let mode: 'heat' | 'cool' | null = null
      if (isHeatSeason) {
        mode = 'heat'; tSet = inp.heatSet
        if (inp.hvacMode === 'whole') operate = 1
        else operate = occ > 0 ? zoneFrac : 0
      } else if (isCoolSeason) {
        mode = 'cool'; tSet = inp.coolSet
        if (inp.hvacMode === 'whole') operate = 1
        else if (occ > 0) operate = zoneFrac
        else if (sleepers > 0 && inp.nightCooling) { operate = 0.3; tSet = inp.coolSet + 1 }
      }
      let hvacKwh = 0
      if (mode && operate > 0) {
        let q: number
        if (mode === 'heat') q = Math.max(0, H * (tSet - ta) - internalW - solarW)
        else q = Math.max(0, (H * (ta - tSet) + internalW + solarW) * (ta >= 24 ? 1.2 : 1.0))
        q *= operate
        // 間欠運転の立ち上がり負荷
        if (inp.hvacMode === 'zonal' && !prevHvacOn) q *= 1.5
        const qKwh = q / 1000
        if (mode === 'heat') {
          heat[i] = qKwh
          if (inp.heatSource === 'aircon') {
            const cop = inp.apf * REAL_USE * clamp(0.35 + 0.035 * ta, 0.25, 0.9)
            hvacKwh = qKwh / cop
          } else {
            gasM3[m] += qKwh / 0.85 / GAS_KWH_PER_M3
          }
        } else {
          cool[i] = qKwh
          const cop = inp.apf * REAL_USE * clamp(1.0 - 0.025 * (ta - 27), 0.6, 1.1)
          hvacKwh = qKwh / cop
        }
        // 室内機・送風の最低消費
        if (qKwh > 0 || operate > 0) hvacKwh += 0.01 * operate
        prevHvacOn = true
      } else prevHvacOn = false
      byCat.hvac[i] = hvacKwh

      // EV
      if (inp.ev) {
        const dayKwh = inp.evKmPerYear / 365 / Math.max(1, inp.evEfficiency) / 0.9
        if (inp.evCharge === 'night' && h >= 1 && h < 5) byCat.ev[i] = dayKwh / 4
        if (inp.evCharge === 'evening' && h >= 19 && h < 22) byCat.ev[i] = dayKwh / 3
        if (inp.evCharge === 'solar') {
          // 車が日中自宅にある想定（休日は昼、平日は帰宅後に不足分）
          if (isHoliday(d) && h >= 10 && h < 15) byCat.ev[i] = (dayKwh * 7) / 2 / 5
          else if (!isHoliday(d) && inp.daytimeHome > 0 && h >= 10 && h < 15) byCat.ev[i] = dayKwh / 5
          else if (!isHoliday(d) && inp.daytimeHome === 0 && h >= 1 && h < 5) byCat.ev[i] = dayKwh / 4 * 0.5
        }
      }
    }
  }

  // --- 実績補正 ---
  const total = new Float64Array(8760)
  const calibration: (number | null)[] = []
  const monthSum = new Array(12).fill(0)
  for (let i = 0; i < 8760; i++) {
    let s = 0
    for (const c of LOAD_CATS) s += byCat[c.key][i]
    total[i] = s
    monthSum[monthOfDay(Math.floor(i / 24))] += s
  }
  const factors = monthSum.map((s, m) => {
    const a = inp.actualMonthly[m]
    return a > 0 && s > 0 ? a / s : null
  })
  // 入力のない月は入力月の平均係数を使う
  const given = factors.filter((f): f is number => f !== null)
  const avg = given.length ? given.reduce((a, b) => a + b, 0) / given.length : 1
  const adj = inp.loadAdjust / 100
  for (let m = 0; m < 12; m++) calibration.push(factors[m])
  for (let i = 0; i < 8760; i++) {
    const m = monthOfDay(Math.floor(i / 24))
    const f = (factors[m] ?? avg) * adj
    if (f === 1) continue
    let s = 0
    for (const c of LOAD_CATS) {
      byCat[c.key][i] *= f
      s += byCat[c.key][i]
    }
    total[i] = s
  }

  return { total, byCat, heat, cool, gasM3, hCoef: H, envelopeArea: envArea, nInf, calibration }
}

// ---------- 蓄電池・売買電 ----------

function dispatch(inp: Inputs, load: Float64Array, pv: Float64Array, withBattery: boolean, capFactor: number, capOverride?: number): HourlyFlow {
  const flow: HourlyFlow = {
    load: new Float64Array(8760), pv, buy: new Float64Array(8760), sell: new Float64Array(8760),
    charge: new Float64Array(8760), discharge: new Float64Array(8760), soc: new Float64Array(8760),
  }
  const kwhNom = capOverride ?? inp.batteryKwh
  const cap = withBattery ? kwhNom * (inp.batteryUsable / 100) * capFactor : 0
  const minSoc = cap * (inp.batteryReserve / 100)
  const eta = Math.sqrt(clamp(inp.batteryEff / 100, 0.5, 1))
  const pmax = withBattery ? inp.batteryKw : 0
  const standby = withBattery ? inp.batteryStandbyW / 1000 : 0
  const plan = inp.plan
  const canArb = plan.type === 'tou' && plan.nightRate < plan.dayRate * eta * eta
  let soc = minSoc
  let target = minSoc

  // 翌日（夜間終了後〜次の夜間開始まで）を自家消費優先で運転した場合に必要な開始残量を探す
  const smartTarget = (startIdx: number) => {
    const sim = (s0: number) => {
      let s = s0
      let bought = 0
      for (let k = 0; k < 24; k++) {
        const i = startIdx + k
        if (i >= 8760) break
        const d = Math.floor(i / 24)
        const h = i % 24
        if (k > 0 && isNightHour(plan, d, h)) break
        const net = pv[i] - load[i] - standby
        if (net >= 0) s = Math.min(cap, s + Math.min(net, pmax) * eta)
        else {
          const dis = Math.min(-net, pmax, Math.max(0, (s - minSoc) * eta))
          s -= dis / eta
          bought += -net - dis
        }
      }
      return bought
    }
    const best = sim(cap)
    let lo = minSoc
    let hi = cap
    if (sim(lo) - best < 0.05) return lo
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2
      if (sim(mid) - best < 0.05) hi = mid
      else lo = mid
    }
    return hi
  }

  for (let i = 0; i < 8760; i++) {
    const d = Math.floor(i / 24)
    const h = i % 24
    const L = load[i] + standby
    flow.load[i] = L
    const P = pv[i]
    const night = isNightHour(plan, d, h)
    if (!withBattery) {
      const self = Math.min(L, P)
      flow.buy[i] = L - self
      flow.sell[i] = P - self
      continue
    }
    let buy = 0
    let sell = 0
    const net = P - L
    // 夜間の系統充電
    if (night && (inp.batteryMode === 'economy' || (inp.batteryMode === 'smart' && canArb))) {
      const prevNight = i > 0 ? isNightHour(plan, Math.floor((i - 1) / 24), (i - 1) % 24) : false
      if (!prevNight) {
        if (inp.batteryMode === 'economy') target = Math.max(minSoc, cap * inp.batteryNightTarget / 100)
        else {
          // 夜間終了時刻を探す
          let j = i
          while (j < 8760 && isNightHour(plan, Math.floor(j / 24), j % 24)) j++
          target = smartTarget(j)
        }
      }
      buy += Math.max(0, -net)
      if (net > 0) {
        const c = Math.min(net, pmax, (cap - soc) / eta)
        soc += c * eta
        flow.charge[i] += c
        sell += net - c
      }
      // 残りの夜間時間で目標まで均等に充電
      let remain = 0
      for (let j = i; j < Math.min(8760, i + 24); j++) {
        if (!isNightHour(plan, Math.floor(j / 24), j % 24)) break
        remain++
      }
      const need = Math.max(0, target - soc) / eta
      const g = Math.min(pmax, need / Math.max(1, remain) * 1.0 + (remain <= 1 ? need : 0))
      const gc = Math.min(g, need)
      if (gc > 0) {
        soc += gc * eta
        flow.charge[i] += gc
        buy += gc
      }
    } else if (net >= 0) {
      const c = Math.min(net, pmax, Math.max(0, (cap - soc) / eta))
      soc += c * eta
      flow.charge[i] = c
      sell = net - c
    } else {
      const deficit = -net
      // 経済モードでは夜間料金帯は放電しない（上で処理）。それ以外は放電
      const dis = Math.min(deficit, pmax, Math.max(0, (soc - minSoc) * eta))
      soc -= dis / eta
      flow.discharge[i] = dis
      buy = deficit - dis
    }
    flow.buy[i] = buy
    flow.sell[i] = sell
    flow.soc[i] = soc
  }
  return flow
}

// ---------- 料金 ----------

type Bill = { monthly: number[]; revenue: number[]; buyM: number[]; sellM: number[] }

function computeBill(plan: RatePlan, flow: { buy: Float64Array; sell: Float64Array }, priceMul: number, sellPrice: number): Bill {
  const monthly = new Array(12).fill(0)
  const revenue = new Array(12).fill(0)
  const buyM = new Array(12).fill(0)
  const sellM = new Array(12).fill(0)
  for (let i = 0; i < 8760; i++) {
    const d = Math.floor(i / 24)
    const m = monthOfDay(d)
    buyM[m] += flow.buy[i]
    sellM[m] += flow.sell[i]
    if (plan.type === 'tou') monthly[m] += flow.buy[i] * buyRate(plan, d, i % 24, m) * priceMul
  }
  for (let m = 0; m < 12; m++) {
    if (plan.type === 'tiered') {
      const k = buyM[m]
      const t1 = Math.min(k, plan.tier1Limit)
      const t2 = Math.min(Math.max(0, k - plan.tier1Limit), plan.tier2Limit - plan.tier1Limit)
      const t3 = Math.max(0, k - plan.tier2Limit)
      monthly[m] += (t1 * plan.tier1 + t2 * plan.tier2 + t3 * plan.tier3) * priceMul
    }
    monthly[m] += plan.basic * priceMul + buyM[m] * (plan.fuelAdj * priceMul + plan.renewLevy)
    revenue[m] = sellM[m] * sellPrice
  }
  return { monthly, revenue, buyM, sellM }
}

const sum = (a: ArrayLike<number>) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]
  return s
}

// ---------- メイン ----------

export function simulate(inp: Inputs): SimResult {
  const cl = findClimate(inp.climateId)
  const monthTemp = inp.customClimate && inp.temp.length === 12 ? inp.temp : cl.temp
  const snowM = inp.customClimate && inp.snow.length === 12 ? inp.snow : cl.snow
  const wx = buildWeather(inp)
  const pv1 = buildPv(inp, wx, snowM)
  const ld = buildLoad(inp, wx, monthTemp)
  const totalKw = inp.arrays.reduce((a, r) => a + r.kw, 0)
  const hasBattery = inp.battery && inp.batteryKwh > 0

  const retention = (y: number) => Math.max(0.5, 1 - (1 - inp.batteryRetention10y / 100) * (y - 1) / 10)
  const sellPriceOf = (y: number) => (y <= 4 ? inp.sellFit1 : y <= 10 ? inp.sellFit2 : inp.sellPost)
  const esc = (y: number) => Math.pow(1 + inp.priceEscalation / 100, y - 1)

  const flowA = { buy: ld.total, sell: new Float64Array(8760) }
  const flowB1 = dispatch(inp, ld.total, pv1, false, 1)
  const flowC1 = hasBattery ? dispatch(inp, ld.total, pv1, true, 1) : null

  const billA1 = computeBill(inp.plan, flowA, 1, 0)
  const billB1 = computeBill(inp.plan, flowB1, 1, sellPriceOf(1))
  const billC1 = flowC1 ? computeBill(inp.plan, flowC1, 1, sellPriceOf(1)) : null

  // ガス代（全シナリオ共通）
  const gasYearCost = sum(ld.gasM3) * inp.gasPrice + (sum(ld.gasM3) > 0 ? inp.gasBasic * 12 : 0)

  // 月別集計
  const months: MonthRow[] = []
  for (let m = 0; m < 12; m++) {
    const lbc = {} as Record<LoadCat, number>
    for (const c of LOAD_CATS) lbc[c.key] = 0
    let load = 0, pv = 0, heatL = 0, coolL = 0, selfB = 0, selfC = 0, ch = 0, dis = 0
    for (let i = 0; i < 8760; i++) {
      if (monthOfDay(Math.floor(i / 24)) !== m) continue
      for (const c of LOAD_CATS) lbc[c.key] += ld.byCat[c.key][i]
      load += ld.total[i]
      pv += pv1[i]
      heatL += ld.heat[i]
      coolL += ld.cool[i]
      selfB += pv1[i] - flowB1.sell[i]
      if (flowC1) {
        selfC += pv1[i] - flowC1.sell[i]
        ch += flowC1.charge[i]
        dis += flowC1.discharge[i]
      }
    }
    months.push({
      month: m + 1, load, pv, loadByCat: lbc, heatLoad: heatL, coolLoad: coolL, gasM3: ld.gasM3[m],
      A: { buy: billA1.buyM[m], bill: billA1.monthly[m] },
      B: { buy: billB1.buyM[m], sell: billB1.sellM[m], self: selfB, bill: billB1.monthly[m], revenue: billB1.revenue[m] },
      C: billC1
        ? { buy: billC1.buyM[m], sell: billC1.sellM[m], self: selfC, bill: billC1.monthly[m], revenue: billC1.revenue[m], charge: ch, discharge: dis }
        : { buy: billB1.buyM[m], sell: billB1.sellM[m], self: selfB, bill: billB1.monthly[m], revenue: billB1.revenue[m], charge: 0, discharge: 0 },
    })
  }

  // 初期費用
  const investB = Math.max(0, totalKw * inp.pvCostPerKw - inp.pvSubsidy)
  const investC = investB + (hasBattery ? Math.max(0, inp.batteryCost - inp.batterySubsidy) : 0)
  const loanPay = (principal: number) => {
    if (inp.loanRate <= 0 && inp.loanYears <= 0) return 0
    const r = inp.loanRate / 100
    const n = inp.loanYears
    if (n <= 0) return 0
    if (r === 0) return principal / n
    return (principal * r) / (1 - Math.pow(1 + r, -n))
  }
  const useLoan = inp.loanRate > 0
  const payB = useLoan ? loanPay(investB) : 0
  const payC = useLoan ? loanPay(investC) : 0

  // 年次シミュレーション
  const years: YearRow[] = []
  let cumB = useLoan ? 0 : -investB
  let cumC = useLoan ? 0 : -investC
  let paybackB: number | null = null
  let paybackC: number | null = null
  const sumBill = (b: Bill) => sum(b.monthly)
  const sumRev = (b: Bill) => sum(b.revenue)
  for (let y = 1; y <= inp.years; y++) {
    const deg = Math.pow(1 - inp.pvDegradation / 100, y - 1)
    const pvY = deg === 1 ? pv1 : pv1.map(v => v * deg)
    const mul = esc(y)
    const sp = sellPriceOf(y)
    const costA = sumBill(computeBill(inp.plan, flowA, mul, 0))
    const fB = deg === 1 ? flowB1 : dispatch(inp, ld.total, pvY, false, 1)
    const bB = computeBill(inp.plan, fB, mul, sp)
    const netB = sumBill(bB) - sumRev(bB)
    let netC = netB
    if (hasBattery) {
      const fC = y === 1 ? flowC1! : dispatch(inp, ld.total, pvY, true, retention(y))
      const bC = computeBill(inp.plan, fC, mul, sp)
      netC = sumBill(bC) - sumRev(bC)
    }
    const extraCost = inp.maintenancePerYear + (y === inp.pcsReplaceYear ? inp.pcsReplaceCost : 0)
    const saveB = costA - netB - extraCost
    const saveC = costA - netC - extraCost
    cumB += saveB - (useLoan && y <= inp.loanYears ? payB : 0)
    cumC += saveC - (useLoan && y <= inp.loanYears ? payC : 0)
    if (paybackB === null && cumB >= 0 && !useLoan) paybackB = y
    if (paybackC === null && cumC >= 0 && !useLoan) paybackC = y
    years.push({ year: y, pvKwh: sum(pvY), costA, netB, netC, saveB, saveC, cumB, cumC, sellPrice: sp })
  }

  const loadYear = sum(ld.total)
  const pvYear1 = sum(pv1)
  const loadByCat = {} as Record<LoadCat, number>
  for (const c of LOAD_CATS) loadByCat[c.key] = sum(ld.byCat[c.key])
  const fC = flowC1 ?? flowB1
  const selfConsB = pvYear1 > 0 ? 1 - sum(flowB1.sell) / pvYear1 : 0
  const selfConsC = pvYear1 > 0 ? 1 - sum(fC.sell) / pvYear1 : 0
  const selfSuffB = 1 - sum(flowB1.buy) / loadYear
  const selfSuffC = 1 - sum(fC.buy) / sum(fC.load)

  // 停電時の目安
  const capUse = hasBattery ? inp.batteryKwh * inp.batteryUsable / 100 : 0
  const eta = Math.sqrt(inp.batteryEff / 100)
  const backupFullHours = capUse > 0 ? (capUse * eta) / (inp.backupLoadW / 1000) : 0
  let soc19 = 0
  if (flowC1) {
    for (let d = 0; d < 365; d++) soc19 += flowC1.soc[d * 24 + 19]
    soc19 /= 365
  }
  const backupEveningHours = flowC1 ? (soc19 * eta) / (inp.backupLoadW / 1000) : 0

  // 蓄電池容量の比較（1年目・卒FIT後の削減額）
  const sweep: SweepRow[] = []
  const costPerKwh = inp.batteryKwh > 0 ? (inp.batteryCost - inp.batterySubsidy) / inp.batteryKwh : 150000
  const bB1 = sumBill(billB1)
  const billBpost = computeBill(inp.plan, flowB1, 1, inp.sellPost)
  const netBpost = sumBill(billBpost) - sumRev(billBpost)
  for (const kwh of [0, 4, 6, 8, 10, 12, 14, 16]) {
    if (kwh === 0) {
      sweep.push({ kwh, selfSuff: selfSuffB, saveFit: 0, savePost: 0, cost: 0 })
      continue
    }
    const f = dispatch(inp, ld.total, pv1, true, 1, kwh)
    const bFit = computeBill(inp.plan, f, 1, sellPriceOf(1))
    const bPost = computeBill(inp.plan, f, 1, inp.sellPost)
    sweep.push({
      kwh,
      selfSuff: 1 - sum(f.buy) / sum(f.load),
      saveFit: bB1 - sumRev(billB1) - (sumBill(bFit) - sumRev(bFit)),
      savePost: netBpost - (sumBill(bPost) - sumRev(bPost)),
      cost: Math.max(0, costPerKwh * kwh),
    })
  }

  return {
    totalKw,
    pvYear1,
    specificYield: totalKw > 0 ? pvYear1 / totalKw : 0,
    loadYear,
    loadByCat,
    heatLoadYear: sum(ld.heat),
    coolLoadYear: sum(ld.cool),
    hCoef: ld.hCoef,
    envelopeArea: ld.envelopeArea,
    infiltrationAch: ld.nInf,
    months,
    years,
    flowB: flowB1,
    flowC: flowC1,
    loadHourByCat: ld.byCat,
    dayKt: wx.dayKt,
    tempHour: wx.temp,
    investB,
    investC,
    paybackB,
    paybackC,
    annualA: sumBill(billA1),
    annualB: sumBill(billB1) - sumRev(billB1),
    annualC: billC1 ? sumBill(billC1) - sumRev(billC1) : sumBill(billB1) - sumRev(billB1),
    selfConsB,
    selfConsC,
    selfSuffB,
    selfSuffC,
    co2Year: (loadYear - sum(fC.buy) + sum(fC.sell)) * inp.co2Factor,
    backupFullHours,
    backupEveningHours,
    gasYearCost,
    calibration: ld.calibration,
    sweep,
  }
}
