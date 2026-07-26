import type { FiscalYear, TaxRate } from '@/types/models';

export interface NetBreakdown {
  gross: number;
  taxable: number;
  contributions: number;
  taxes: number;
  // due = contributions + taxes ("da accantonare"); net = gross - due.
  due: number;
  net: number;
}

// Netto previsto from the year's fiscal profile: under forfettario the
// taxable income is gross × profitability index, under ordinario it's
// the gross itself. Every tax/contribution row of the year taxes its
// own slice of the taxable income (bracket between fromIncome and
// toIncome, no upper bound when toIncome is null). Returns null when
// the year has no fiscal profile configured.
export function computeNet(
  gross: number,
  year: number,
  fiscalYears: FiscalYear[],
  taxRates: TaxRate[],
): NetBreakdown | null {
  const fy = fiscalYears.find((f) => f.year === year);
  if (!fy) return null;
  const taxable =
    fy.regime === 'forfettario' ? gross * ((fy.profitabilityIndex ?? 100) / 100) : gross;
  let contributions = 0;
  let taxes = 0;
  for (const r of taxRates) {
    if (r.year !== year) continue;
    const slice = Math.max(0, Math.min(taxable, r.toIncome ?? Infinity) - r.fromIncome);
    const amount = (slice * r.rate) / 100;
    if (r.type === 'contributi') {
      contributions += amount;
    } else {
      taxes += amount;
    }
  }
  const due = contributions + taxes;
  return { gross, taxable, contributions, taxes, due, net: gross - due };
}
