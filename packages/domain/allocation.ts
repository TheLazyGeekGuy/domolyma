export function allocateCents(
  amount: number,
  lots: { id: string; weight: number }[],
) {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 100_000_000 ||
    !lots.length ||
    new Set(lots.map((l) => l.id)).size !== lots.length ||
    lots.some((l) => !Number.isSafeInteger(l.weight) || l.weight <= 0)
  )
    throw new Error("Montant ou clé invalide");
  const total = lots.reduce((s, l) => s + BigInt(l.weight), 0n);
  const rows = lots.map((l) => {
    const product = BigInt(amount) * BigInt(l.weight);
    return {
      lotId: l.id,
      cents: Number(product / total),
      remainder: product % total,
    };
  });
  let remaining = amount - rows.reduce((s, l) => s + l.cents, 0);
  const ranked = [...rows].sort((a, b) =>
    a.remainder === b.remainder
      ? a.lotId.localeCompare(b.lotId, "en")
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const row of ranked) {
    if (remaining-- <= 0) break;
    row.cents++;
  }
  return rows.map(({ lotId, cents }) => ({ lotId, cents }));
}
