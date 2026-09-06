import { atom, computed } from "nanostores";
import { $kids } from "./family.js";
import { $chores, $completions, $counts, timesEarned } from "./chores.js";

export const $spent = atom({});
export const $goldSpent = atom({});

export const $balances = computed([$kids, $chores, $completions, $counts, $spent, $goldSpent], (kids, chores, completions, counts, spent, goldSpent) => {
  const balances = {};
  for (const kid of kids) {
    let stars = 0;
    let gold = 0;
    for (const chore of chores) {
      if (!(chore.kidIds || []).includes(kid.id)) continue;
      const count = timesEarned(chore, kid.id, { completions, counts });
      stars += (chore.points || 0) * count;
      if (chore.gold) gold += count;
    }
    balances[kid.id] = {
      stars: Math.max(0, stars - (spent[kid.id] || 0)),
      gold: Math.max(0, gold - (goldSpent[kid.id] || 0)),
    };
  }
  return balances;
});

export function starsFor(kidId) { return $balances.get()[kidId]?.stars || 0; }
export function goldFor(kidId) { return $balances.get()[kidId]?.gold || 0; }
export function familyStars() { return Object.values($balances.get()).reduce((sum, value) => sum + value.stars, 0); }
export function familyGold() { return Object.values($balances.get()).reduce((sum, value) => sum + value.gold, 0); }

