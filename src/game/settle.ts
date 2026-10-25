// Kasse: Alle sammeln Kassenbons, am Schluss wird durch die Anzahl Personen geteilt.

export interface Settlement {
  total: number;
  share: number;
  balances: { id: string; paid: number; balance: number }[];
  transfers: { from: string; to: string; amount: number }[];
}

/** Auf 5 Rappen runden */
export const round05 = (x: number) => Math.round(x * 20) / 20;

export function settle(playerIds: string[], expenses: { paidBy: string; amount: number }[], splitCount: number | null): Settlement {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const n = Math.max(1, splitCount ?? playerIds.length);
  const share = total / n;
  const paid = new Map(playerIds.map((id) => [id, 0]));
  for (const e of expenses) paid.set(e.paidBy, (paid.get(e.paidBy) ?? 0) + e.amount);
  const balances = [...paid.entries()].map(([id, p]) => ({ id, paid: p, balance: p - share }));

  const debtors = balances.filter((b) => b.balance < -0.01).map((b) => ({ id: b.id, amount: -b.balance }));
  const creditors = balances.filter((b) => b.balance > 0.01).map((b) => ({ id: b.id, amount: b.balance }));
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  const transfers: Settlement['transfers'] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (round05(amount) > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: round05(amount) });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  return { total, share, balances, transfers };
}
