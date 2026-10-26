export type Expense = {
  invoice_date: string;
  amount_cents: number;
  paid_cents: number;
  cancelled: number;
};
/** Indicative single-key view, not accounting or a call for payment. */
export function budgetSummary(
  amountCents: number | null,
  invoices: Expense[],
  year: number,
  today: string,
) {
  const currentYear = Number(today.slice(0, 4));
  const throughMonth =
    year < currentYear
      ? 12
      : year > currentYear
        ? 0
        : Number(today.slice(5, 7));
  const active = invoices.filter(
    (i) =>
      !i.cancelled &&
      i.invoice_date.slice(0, 4) === String(year) &&
      i.invoice_date <= today,
  );
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    budgetCents:
      amountCents === null
        ? null
        : Math.round((amountCents * (index + 1)) / 12),
    invoicedCents: active
      .filter((i) => Number(i.invoice_date.slice(5, 7)) <= index + 1)
      .reduce((s, i) => s + i.amount_cents, 0),
  }));
  const invoicedCents = active.reduce((s, i) => s + i.amount_cents, 0);
  const paidCents = active.reduce((s, i) => s + i.paid_cents, 0);
  const forecastCents =
    amountCents === null || active.length === 0
      ? null
      : invoicedCents + Math.round((amountCents * (12 - throughMonth)) / 12);
  return {
    asOf: today,
    throughMonth,
    budgetCents: amountCents,
    invoicedCents,
    paidCents,
    unpaidCents: invoicedCents - paidCents,
    forecastCents,
    varianceCents:
      forecastCents === null || amountCents === null
        ? null
        : forecastCents - amountCents,
    months,
  };
}

/** Rounded indicative share; all calculations use integer cents and exact products. */
export function indicativeShare(
  amount: number | null,
  weight: number,
  total: number,
) {
  if (amount === null || total <= 0) return null;
  const numerator = BigInt(amount) * BigInt(weight);
  return Number((numerator * 2n + BigInt(total)) / (2n * BigInt(total)));
}
