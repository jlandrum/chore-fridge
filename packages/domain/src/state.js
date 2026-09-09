import { DEFAULT_SAYINGS } from "./sayings.js";
import { defaultCurrencies } from "./currencies.js";

export function defaultState() {
  return {
    version: 1,
    requireParentModeForCompletion: false,
    requireParentModeForRedemptions: false,
    mcpEnabled: false,
    pin: "",
    familyName: "Our Family",
    sayings: DEFAULT_SAYINGS.slice(),
    currencies: defaultCurrencies(),
    currencySpent: {},
    nightMode: "auto",
    kids: [],
    chores: [],
    rewards: [],
    completions: {},
    counts: {},
    spent: {},
    goldSpent: {},
    setupDone: false,
    updatedAt: 0,
  };
}
