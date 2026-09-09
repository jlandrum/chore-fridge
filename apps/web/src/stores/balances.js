import { amountFor, balancesFor } from "@chore-fridge/domain/balances";
import { atom, computed } from "nanostores";
import { $kids } from "./family.js";
import { $chores, $completions, $counts } from "./chores.js";

export const $balanceCarry = atom(null);
export const $creditProjection = atom(null);
export const $spent = atom({});
export const $goldSpent = atom({});
export const $currencySpent = atom({});

export const $balances = computed([$kids, $chores, $completions, $counts, $spent, $goldSpent, $currencySpent, $creditProjection, $balanceCarry], (kids, chores, completions, counts, spent, goldSpent, currencySpent, creditProjection, balanceCarry) => {
  return balancesFor({ kids, chores, completions, counts, spent, goldSpent, currencySpent, creditProjection, balanceCarry });
});

export function starsFor(kidId) { return amountFor($balances.get()[kidId], "star"); }
export function goldFor(kidId) { return amountFor($balances.get()[kidId], "gold"); }
export function amountForKid(kidId, currency) { return amountFor($balances.get()[kidId], currency); }
export function familyStars() { return Object.values($balances.get()).reduce((sum, value) => sum + amountFor(value, "star"), 0); }
export function familyGold() { return Object.values($balances.get()).reduce((sum, value) => sum + amountFor(value, "gold"), 0); }
export function familyAmount(currency) { return Object.values($balances.get()).reduce((sum, value) => sum + amountFor(value, currency), 0); }

