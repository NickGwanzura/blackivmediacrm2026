import { Contract, VAT_RATE } from '../types';

const MS_PER_AVG_MONTH = 30.4375 * 24 * 60 * 60 * 1000;

// Fractional calendar months between two ISO date strings. Returns 0 for
// same-day / invalid / reversed ranges so a bad form entry can never inflate
// a contract value. Using the average-month length (30.4375 days) keeps
// spans like "Mar 14 2025 → Mar 14 2027" at exactly 24 without calendar
// arithmetic edge cases around Feb / month-end.
export const monthsBetween = (start: string | undefined, end: string | undefined): number => {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return (e - s) / MS_PER_AVG_MONTH;
};

// Single source of truth for Contract.totalContractValue, shared by single
// create (Rentals), batch create (Rentals), edit (ContractList), and bulk
// import (BillboardList). The prior call sites hardcoded 12 months, which
// inflated short-term contracts and understated multi-year ones.
export const computeContractValue = (
  input: Pick<Contract, 'startDate' | 'endDate' | 'monthlyRate' | 'installationCost' | 'printingCost' | 'hasVat'>,
): number => {
  const months = monthsBetween(input.startDate, input.endDate);
  const rental = (Number(input.monthlyRate) || 0) * months;
  const subtotal = rental + (Number(input.installationCost) || 0) + (Number(input.printingCost) || 0);
  const total = input.hasVat ? subtotal * (1 + VAT_RATE) : subtotal;
  return Math.round(total * 100) / 100;
};
