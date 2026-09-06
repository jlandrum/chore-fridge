import { timesEarned } from "./chores.js";

export function balancesFor(household) {
  const result = {};
  for (const kid of household.kids) {
    let stars = 0, gold = 0;
    for (const chore of household.chores) {
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
