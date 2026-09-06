export function defaultState() {
  return {
    version: 1,
    requireParentModeForCompletion: false,
    pin: "",
    familyName: "Our Family",
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
