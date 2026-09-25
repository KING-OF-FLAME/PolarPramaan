// Display formatting. Internal values keep full precision; the rounding rule is
// declared wherever a number is shown.
export const DISPLAY_DECIMALS: Record<string, number> = { 'million km²': 2, tenths: 1, m: 2, '°C': 1, 'm/s': 1 };

export function decimalsFor(units: string): number {
  return DISPLAY_DECIMALS[units] ?? 2;
}

export function fmt(value: number | null | undefined, units: string, withUnit = true): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  const d = decimalsFor(units);
  const s = value.toFixed(d);
  return withUnit ? `${s} ${units}` : s;
}

export function fmtSigned(value: number | null | undefined, units: string): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  const s = fmt(Math.abs(value), units);
  return `${value < 0 ? '−' : '+'}${s}`;
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
export const monthName = (m: number, lang: 'en' | 'hi' = 'en') => (lang === 'hi' ? MONTHS_HI : MONTHS_EN)[m - 1];

/** "2012-09" -> "September 2012"; other keys are returned unchanged. */
export function rowKeyLabel(rowKey: string, lang: 'en' | 'hi' = 'en'): string {
  const m = rowKey.match(/^(\d{4})-(\d{2})$/);
  return m ? `${monthName(Number(m[2]), lang)} ${m[1]}` : rowKey;
}
