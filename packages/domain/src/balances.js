import { reconcileCredits } from "./task-history.js";
import { timesEarned } from "./chores.js";

export function balancesFor(household) {
  const result = {};
  const ledger = household.creditLedger ? reconcileCredits(household,household.creditLedger) : null;
  for (const kid of household.kids) {
    let stars = 0, gold = 0;
    if (ledger) {
      for (const entry of Object.values(ledger).flat()) {
        if (entry.kidId !== kid.id) continue;
        stars += entry.points * entry.units;
        if (entry.gold) gold += entry.units;
      }
    } else for (const chore of household.chores) {
      if (!(chore.kidIds || []).includes(kid.id)) continue;
      const count = timesEarned(chore, kid.id, household);
      stars += (chore.points || 0) * count;
      if (chore.gold) gold += count;
    }
    result[kid.id] = {
      stars: Math.max(0, stars - (household.spent[kid.id] || 0)),
      gold: Math.max(0, gold - (household.goldSpent[kid.id] || 0)),
    };
  }
  return result;
}
