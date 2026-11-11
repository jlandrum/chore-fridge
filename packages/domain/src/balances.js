import { reconcileCredits } from "./task-history.js";
import { timesEarned } from "./chores.js";
import { CURRENCY_IDS, currencyId, emptyAmounts, spentFor } from "./currencies.js";

export function creditValue(entry) {
  const amounts = emptyAmounts();
  const units = Number(entry?.units) || 0;
  const points = Number(entry?.points) || 0;
  // Recorded allocations from before the currency list paid points as stars and one gold star per completion.
  // A chore that is only marked gold still pays its points as gold; that object has no task id.
  if (entry?.taskId && entry.gold && !CURRENCY_IDS.includes(entry.currency)) {
    amounts.star = units * points;
    amounts.gold = units;
  } else {
    amounts[currencyId(entry)] = units * points;
  }
  amounts.stars = amounts.star;
  return amounts;
}

export function amountFor(balance, id) {
  if (!balance) return 0;
  if (id === "star") return Number(balance.star || balance.stars) || 0;
  return Number(balance[id]) || 0;
}

export function balancesFor(household) {
  const result = {};
  const projection = household.creditProjection || household.creditLedger;
  const ledger = projection ? reconcileCredits(household,projection) : null;
  for (const kid of household.kids) {
    const amounts = emptyAmounts();
    const carry = household.balanceCarry?.[kid.id] || {};
    for (const id of CURRENCY_IDS) amounts[id] = Number(carry[id] || (id === "star" ? carry.stars : 0)) || 0;
    if (ledger) {
      for (const entry of Object.values(ledger).flat()) {
        if (entry.kidId !== kid.id) continue;
        const value = creditValue(entry);
        for (const id of CURRENCY_IDS) amounts[id] += value[id] || 0;
      }
    } else for (const chore of household.chores) {
      if (!(chore.kidIds || []).includes(kid.id)) continue;
      const count = timesEarned(chore, kid.id, household);
      const value = creditValue({ units: count, points: chore.points, gold: chore.gold, currency: chore.currency });
      for (const id of CURRENCY_IDS) amounts[id] += value[id] || 0;
    }
    for (const id of CURRENCY_IDS) amounts[id] = Math.max(0, amounts[id] + (household.exchangeEarned?.[id]?.[kid.id] || 0) - spentFor(household, id, kid.id));
    const out = { stars: amounts.star, gold: amounts.gold };
    for (const id of CURRENCY_IDS) {
      if (id === "star" || id === "gold") continue;
      if (amounts[id]) out[id] = amounts[id];
    }
    result[kid.id] = out;
  }
  return result;
}
