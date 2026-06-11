export type StateTaxConfidence = 'none' | 'flat' | 'bracket' | 'basic';

export interface StateTaxPreset {
  code: string;
  name: string;
  confidence: StateTaxConfidence;
  taxYear: number;
  ratesAsOf: string;
  sourceName: string;
  sourceUrl: string;
  notes: string;
  flatRate?: number;
  brackets?: {
    single: Array<[number | null, number]>;
    married: Array<[number | null, number]>;
  };
}

const RATES_AS_OF = '2026-06-11';
const TAX_YEAR = 2026;
const AGG_SOURCE = 'Tax Foundation-style aggregate state rate summaries and state revenue publications';
const AGG_URL = 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2025/';

const none = (code: string, name: string): StateTaxPreset => ({
  code,
  name,
  confidence: 'none',
  taxYear: TAX_YEAR,
  ratesAsOf: RATES_AS_OF,
  sourceName: AGG_SOURCE,
  sourceUrl: AGG_URL,
  notes: 'No broad-based state individual income tax modeled. Local taxes and special taxes are not included.',
  flatRate: 0,
});

const flat = (code: string, name: string, flatRate: number, notes = 'Flat-rate estimate. Deductions, credits, exemptions, retirement-income exclusions, and local taxes are not included.'): StateTaxPreset => ({
  code,
  name,
  confidence: 'flat',
  taxYear: TAX_YEAR,
  ratesAsOf: RATES_AS_OF,
  sourceName: AGG_SOURCE,
  sourceUrl: AGG_URL,
  notes,
  flatRate,
});

const basic = (code: string, name: string, flatRate: number): StateTaxPreset => ({
  code,
  name,
  confidence: 'basic',
  taxYear: TAX_YEAR,
  ratesAsOf: RATES_AS_OF,
  sourceName: AGG_SOURCE,
  sourceUrl: AGG_URL,
  notes: 'Basic estimate using an approximate top or representative state rate. State-specific deductions, credits, exemptions, phaseouts, retirement-income treatment, and local taxes are not included.',
  flatRate,
});

const bracket = (
  code: string,
  name: string,
  single: Array<[number | null, number]>,
  married: Array<[number | null, number]>,
): StateTaxPreset => ({
  code,
  name,
  confidence: 'bracket',
  taxYear: TAX_YEAR,
  ratesAsOf: RATES_AS_OF,
  sourceName: AGG_SOURCE,
  sourceUrl: AGG_URL,
  notes: 'Progressive bracket estimate. State-specific deductions, credits, exemptions, phaseouts, retirement-income treatment, and local taxes are not included.',
  brackets: { single, married },
});

export const STATE_TAX_PRESETS: StateTaxPreset[] = [
  none('AK', 'Alaska'),
  bracket('AL', 'Alabama', [[500, 0.02], [3000, 0.04], [null, 0.05]], [[1000, 0.02], [6000, 0.04], [null, 0.05]]),
  flat('AZ', 'Arizona', 0.025),
  bracket('AR', 'Arkansas', [[4500, 0.02], [null, 0.039]], [[4500, 0.02], [null, 0.039]]),
  bracket('CA', 'California', [[10756, 0.01], [25499, 0.02], [40245, 0.04], [55866, 0.06], [70606, 0.08], [360659, 0.093], [432787, 0.103], [721314, 0.113], [1000000, 0.123], [null, 0.133]], [[21512, 0.01], [50998, 0.02], [80490, 0.04], [111732, 0.06], [141732, 0.08], [721318, 0.093], [865574, 0.103], [1000000, 0.113], [1442628, 0.123], [null, 0.133]]),
  flat('CO', 'Colorado', 0.044),
  basic('CT', 'Connecticut', 0.0699),
  basic('DE', 'Delaware', 0.066),
  basic('DC', 'District of Columbia', 0.1075),
  none('FL', 'Florida'),
  flat('GA', 'Georgia', 0.0499),
  basic('HI', 'Hawaii', 0.11),
  flat('IA', 'Iowa', 0.038),
  flat('ID', 'Idaho', 0.053),
  flat('IL', 'Illinois', 0.0495),
  flat('IN', 'Indiana', 0.0295),
  basic('KS', 'Kansas', 0.0558),
  flat('KY', 'Kentucky', 0.04),
  flat('LA', 'Louisiana', 0.03),
  basic('MA', 'Massachusetts', 0.05),
  basic('MD', 'Maryland', 0.0575),
  basic('ME', 'Maine', 0.0715),
  flat('MI', 'Michigan', 0.0425),
  basic('MN', 'Minnesota', 0.0985),
  basic('MO', 'Missouri', 0.047),
  flat('MS', 'Mississippi', 0.044, 'Flat-rate estimate. Mississippi exempts lower income before applying its main rate; deductions, credits, retirement-income exclusions, and local taxes are not included.'),
  basic('MT', 'Montana', 0.059),
  flat('NC', 'North Carolina', 0.0399),
  basic('ND', 'North Dakota', 0.025),
  basic('NE', 'Nebraska', 0.052),
  none('NH', 'New Hampshire'),
  basic('NJ', 'New Jersey', 0.1075),
  basic('NM', 'New Mexico', 0.059),
  none('NV', 'Nevada'),
  basic('NY', 'New York', 0.109),
  flat('OH', 'Ohio', 0.0275, 'Basic flat-rate estimate. Ohio has income exclusions and local income taxes that are not included.'),
  basic('OK', 'Oklahoma', 0.0475),
  bracket('OR', 'Oregon', [[4400, 0.0475], [11050, 0.0675], [125000, 0.0875], [null, 0.099]], [[8800, 0.0475], [22100, 0.0675], [250000, 0.0875], [null, 0.099]]),
  flat('PA', 'Pennsylvania', 0.0307, 'Flat-rate estimate. Local earned income taxes and retirement-income exemptions are not included.'),
  bracket('RI', 'Rhode Island', [[79900, 0.0375], [181650, 0.0475], [null, 0.0599]], [[79900, 0.0375], [181650, 0.0475], [null, 0.0599]]),
  bracket('SC', 'South Carolina', [[3560, 0], [17830, 0.03], [null, 0.062]], [[3560, 0], [17830, 0.03], [null, 0.062]]),
  none('SD', 'South Dakota'),
  none('TN', 'Tennessee'),
  none('TX', 'Texas'),
  flat('UT', 'Utah', 0.0455),
  bracket('VA', 'Virginia', [[3000, 0.02], [5000, 0.03], [17000, 0.05], [null, 0.0575]], [[3000, 0.02], [5000, 0.03], [17000, 0.05], [null, 0.0575]]),
  bracket('VT', 'Vermont', [[47900, 0.0335], [116000, 0.066], [242000, 0.076], [null, 0.0875]], [[79950, 0.0335], [193300, 0.066], [294600, 0.076], [null, 0.0875]]),
  none('WA', 'Washington'),
  bracket('WI', 'Wisconsin', [[14680, 0.035], [29370, 0.044], [323290, 0.053], [null, 0.0765]], [[19580, 0.035], [39150, 0.044], [431060, 0.053], [null, 0.0765]]),
  bracket('WV', 'West Virginia', [[10000, 0.0222], [25000, 0.0296], [40000, 0.0333], [60000, 0.0444], [null, 0.0482]], [[10000, 0.0222], [25000, 0.0296], [40000, 0.0333], [60000, 0.0444], [null, 0.0482]]),
  none('WY', 'Wyoming'),
];

export const CUSTOM_STATE_TAX_PRESET = 'CUSTOM';

export function getStateTaxPreset(code?: string): StateTaxPreset | undefined {
  if (!code || code === CUSTOM_STATE_TAX_PRESET) return undefined;
  return STATE_TAX_PRESETS.find(p => p.code === code);
}
