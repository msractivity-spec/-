// 太陽光・蓄電池シミュレーション 入力値の型と初期値

export type PvArray = {
  kw: number // パネル容量 kW
  azimuth: number // 方位 0=南, -90=東, 90=西 (度)
  pitchSun: number // 屋根勾配 寸 (例 4 = 4寸勾配)
  shade: number // 影による損失 %
}

export type RatePlanType = 'tiered' | 'tou'

export type RatePlan = {
  name: string
  type: RatePlanType
  basic: number // 基本料金 円/月
  // 段階料金（従量電灯）
  tier1Limit: number
  tier2Limit: number
  tier1: number
  tier2: number
  tier3: number
  // 時間帯別
  dayRate: number // デイ 円/kWh
  nightRate: number // ナイト 円/kWh
  nightStart: number // 夜間開始 時 (例 1)
  nightEnd: number // 夜間終了 時 (例 6) ※この時刻を含まない
  peakRate: number // ピーク 円/kWh (0なら無し)
  peakStart: number
  peakEnd: number
  peakSummerOnly: boolean // 7-9月の平日のみピーク
  weekendNight: boolean // 土日祝は終日ナイト料金
  // 共通
  fuelAdj: number // 燃料費調整額 円/kWh
  renewLevy: number // 再エネ賦課金 円/kWh
}

export type Inputs = {
  projectName: string // 邸名・プラン名（印刷用）
  // 地域
  climateId: string
  customClimate: boolean
  temp: number[]
  ghi: number[]
  snow: number[]
  // 建物
  floorArea: number // 延床 m²
  stories: 1 | 2 | 3
  envelopeArea: number // 外皮面積 m² (0=自動推定)
  ceilingHeight: number // 平均天井高 m
  ua: number // UA値 W/m²K
  cValue: number // C値 cm²/m²
  etaAC: number // 冷房期 平均日射熱取得率
  etaAH: number // 暖房期 平均日射熱取得率
  ventType: 'type1' | 'type3' // 第1種(熱交換) / 第3種
  heatRecovery: number // 熱交換効率 %
  ventFanW: number // 換気ファン電力 W
  // 冷暖房
  hvacMode: 'zonal' | 'whole' // 個別エアコン(居室間欠) / 全館空調(24h連続)
  heatSource: 'aircon' | 'fuel' // 暖房熱源
  apf: number // エアコンAPF
  heatSet: number // 暖房設定温度
  coolSet: number // 冷房設定温度
  nightCooling: boolean // 夏の夜間（就寝時）も冷房
  // 家族構成・生活
  adults: number
  children: number
  elderly: number
  wakeHour: number
  sleepHour: number
  leaveHour: number
  returnHour: number
  daytimeHome: number // 平日日中の在宅人数
  workFromHomeDays: number // 在宅勤務日数/週（共働きでも日中在宅になる日）
  // 給湯
  waterHeater: 'ecocute' | 'gas' | 'electric'
  ecocuteApf: number // 年間給湯保温効率
  ecocuteSolarMode: boolean // 昼間沸き上げ（おひさまエコキュート等）
  hotWaterPerPerson: number // 1人1日の給湯量 L (40℃換算、浴槽を除く)
  bathDaysPerWeek: number // 湯はり日数/週
  bathVolume: number // 浴槽湯量 L
  // 調理・家電
  cooking: 'ih' | 'gas'
  baseLoadW: number // 冷蔵庫・待機電力など常時負荷 W
  applianceKwhPerPerson: number // 照明・家電 1人1日あたり kWh
  dishwasher: boolean
  dryer: 'none' | 'heatpump' | 'heater'
  bathDryerHoursPerWeek: number // 浴室乾燥 時間/週
  // EV
  ev: boolean
  evKmPerYear: number
  evEfficiency: number // km/kWh
  evCharge: 'night' | 'evening' | 'solar'
  // 太陽光
  arrays: PvArray[]
  moduleType: 'mono' | 'hjt' | 'poly' // 単結晶 / HJT / 多結晶
  pcsKw: number // パワコン定格 kW
  pcsEff: number // パワコン効率 %
  soiling: number // 汚れ損失 %
  wiring: number // 配線・ミスマッチ等 %
  pvDegradation: number // 年間劣化 %
  // 蓄電池
  battery: boolean
  batteryKwh: number // 公称容量
  batteryUsable: number // 実効容量 %
  batteryKw: number // 最大充放電 kW
  batteryEff: number // 往復効率 %
  batteryStandbyW: number // 待機電力 W
  batteryMode: 'green' | 'economy' | 'smart'
  batteryReserve: number // 停電用 残量 %
  batteryNightTarget: number // 経済モードの夜間充電目標 %
  batteryRetention10y: number // 10年後の容量維持率 %
  // 料金
  plan: RatePlan
  sellFit1: number // 1-4年目 売電単価
  sellFit2: number // 5-10年目 売電単価
  sellPost: number // 卒FIT後
  priceEscalation: number // 電気料金上昇率 %/年
  gasPrice: number // 都市ガス/LPガス 円/m³
  gasBasic: number // ガス基本料金 円/月
  // 補正
  actualMonthly: number[] // 実績 kWh/月 (0=未入力)
  loadAdjust: number // 全体補正 %
  // 費用
  pvCostPerKw: number // 円/kW
  batteryCost: number // 円
  pvSubsidy: number
  batterySubsidy: number
  maintenancePerYear: number
  pcsReplaceYear: number
  pcsReplaceCost: number
  years: number
  loanRate: number // ローン金利 % (0=現金)
  loanYears: number
  co2Factor: number // kg-CO2/kWh
  backupLoadW: number // 停電時に使う特定負荷 W
}

export const RATE_PRESETS: RatePlan[] = [
  {
    name: '従量電灯B（東京電力EP 40A 目安）', type: 'tiered', basic: 1247.0,
    tier1Limit: 120, tier2Limit: 300, tier1: 29.8, tier2: 36.4, tier3: 40.49,
    dayRate: 35.76, nightRate: 27.86, nightStart: 1, nightEnd: 6,
    peakRate: 0, peakStart: 10, peakEnd: 17, peakSummerOnly: true, weekendNight: false,
    fuelAdj: 0, renewLevy: 3.98,
  },
  {
    name: 'スマートライフS（東京電力EP 40A 目安）', type: 'tou', basic: 1247.0,
    tier1Limit: 120, tier2Limit: 300, tier1: 29.8, tier2: 36.4, tier3: 40.49,
    dayRate: 35.76, nightRate: 27.86, nightStart: 1, nightEnd: 6,
    peakRate: 0, peakStart: 10, peakEnd: 17, peakSummerOnly: true, weekendNight: false,
    fuelAdj: 0, renewLevy: 3.98,
  },
  {
    name: '従量電灯A（関西電力 目安）', type: 'tiered', basic: 522.58,
    tier1Limit: 120, tier2Limit: 300, tier1: 20.21, tier2: 25.61, tier3: 28.59,
    dayRate: 28, nightRate: 16, nightStart: 23, nightEnd: 7,
    peakRate: 0, peakStart: 10, peakEnd: 17, peakSummerOnly: true, weekendNight: false,
    fuelAdj: 0, renewLevy: 3.98,
  },
  {
    name: 'オール電化向け 3時間帯（汎用・例）', type: 'tou', basic: 1500,
    tier1Limit: 120, tier2Limit: 300, tier1: 30, tier2: 36, tier3: 40,
    dayRate: 33, nightRate: 24, nightStart: 23, nightEnd: 7,
    peakRate: 40, peakStart: 13, peakEnd: 16, peakSummerOnly: true, weekendNight: true,
    fuelAdj: 0, renewLevy: 3.98,
  },
]

export const DEFAULT_INPUTS: Inputs = {
  projectName: '',
  climateId: 'tokyo',
  customClimate: false,
  temp: [],
  ghi: [],
  snow: [],
  floorArea: 115,
  stories: 2,
  envelopeArea: 0,
  ceilingHeight: 2.4,
  ua: 0.46,
  cValue: 0.5,
  etaAC: 2.0,
  etaAH: 3.0,
  ventType: 'type3',
  heatRecovery: 0,
  ventFanW: 12,
  hvacMode: 'zonal',
  heatSource: 'aircon',
  apf: 5.8,
  heatSet: 20,
  coolSet: 27,
  nightCooling: true,
  adults: 2,
  children: 2,
  elderly: 0,
  wakeHour: 6,
  sleepHour: 23,
  leaveHour: 8,
  returnHour: 18,
  daytimeHome: 1,
  workFromHomeDays: 0,
  waterHeater: 'ecocute',
  ecocuteApf: 3.3,
  ecocuteSolarMode: false,
  hotWaterPerPerson: 70,
  bathDaysPerWeek: 6,
  bathVolume: 180,
  cooking: 'ih',
  baseLoadW: 90,
  applianceKwhPerPerson: 1.6,
  dishwasher: true,
  dryer: 'heatpump',
  bathDryerHoursPerWeek: 0,
  ev: false,
  evKmPerYear: 8000,
  evEfficiency: 6.5,
  evCharge: 'night',
  arrays: [{ kw: 5.5, azimuth: 0, pitchSun: 4, shade: 0 }],
  moduleType: 'mono',
  pcsKw: 5.5,
  pcsEff: 96,
  soiling: 2,
  wiring: 4,
  pvDegradation: 0.5,
  battery: true,
  batteryKwh: 9.8,
  batteryUsable: 90,
  batteryKw: 3.0,
  batteryEff: 88,
  batteryStandbyW: 20,
  batteryMode: 'green',
  batteryReserve: 20,
  batteryNightTarget: 50,
  batteryRetention10y: 80,
  plan: RATE_PRESETS[1],
  sellFit1: 24,
  sellFit2: 8.3,
  sellPost: 8,
  priceEscalation: 2,
  gasPrice: 180,
  gasBasic: 1000,
  actualMonthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  loadAdjust: 100,
  pvCostPerKw: 250000,
  batteryCost: 1500000,
  pvSubsidy: 0,
  batterySubsidy: 0,
  maintenancePerYear: 5000,
  pcsReplaceYear: 15,
  pcsReplaceCost: 250000,
  years: 30,
  loanRate: 0,
  loanYears: 35,
  co2Factor: 0.43,
  backupLoadW: 400,
}
