export const CURRENCY_IDS = ["star", "gold", "coin", "dollar", "hours", "custom1", "custom2"];

export const CURRENCY_DEFAULTS = {
  star: { id: "star", name: "Star", enabled: true, mark: "★" },
  gold: { id: "gold", name: "Gold Star", enabled: true, mark: "★" },
  coin: { id: "coin", name: "Coin", enabled: false, mark: "🪙" },
  dollar: { id: "dollar", name: "Dollar", enabled: false, mark: "$" },
  hours: { id: "hours", name: "Hours", enabled: false, mark: "⏱" },
  custom1: { id: "custom1", name: "Custom 1", enabled: false, emoji: "①" },
  custom2: { id: "custom2", name: "Custom 2", enabled: false, emoji: "②" },
};

export function defaultCurrencies() {
  return CURRENCY_IDS.map((id) => {
    const fallback = CURRENCY_DEFAULTS[id];
    const item = { id, name: fallback.name, enabled: fallback.enabled };
    if (fallback.emoji) item.emoji = fallback.emoji;
    return item;
  });
}

export function normalizeCurrencies(list) {
  const incoming = new Map((Array.isArray(list) ? list : []).map((item) => [item && item.id, item]));
  const next = CURRENCY_IDS.map((id) => {
    const fallback = CURRENCY_DEFAULTS[id];
    const saved = incoming.get(id);
    const name = saved && String(saved.name || "").trim() ? String(saved.name).trim().slice(0, 40) : fallback.name;
    const item = { id, name, enabled: saved ? !!saved.enabled : fallback.enabled };
    if (id === "custom1" || id === "custom2") {
      const emoji = saved && String(saved.emoji || "").trim() ? String(saved.emoji).trim().slice(0, 32) : fallback.emoji;
      item.emoji = emoji || fallback.emoji;
    }
    return item;
  });
  if (!next.some((item) => item.enabled)) next[0].enabled = true;
  return next;
}

export function currencyId(item) {
  if (item && CURRENCY_IDS.includes(item.currency)) return item.currency;
  if (item && item.gold) return "gold";
  return "star";
}

export function currencyById(list, id) {
  return normalizeCurrencies(list).find((item) => item.id === id) || CURRENCY_DEFAULTS[id] || CURRENCY_DEFAULTS.star;
}

export function enabledCurrencies(list) {
  return normalizeCurrencies(list).filter((item) => item.enabled);
}

export function emptyAmounts() {
  return Object.fromEntries(CURRENCY_IDS.map((id) => [id, 0]));
}

export function spentFor(household, id, kidId) {
  if (id === "star") return (household.spent || {})[kidId] || 0;
  if (id === "gold") return (household.goldSpent || {})[kidId] || 0;
  return ((household.currencySpent || {})[id] || {})[kidId] || 0;
}

export function addSpent(household, id, kidId, amount) {
  if (id === "star") {
    household.spent = { ...(household.spent || {}), [kidId]: ((household.spent || {})[kidId] || 0) + amount };
    return;
  }
  if (id === "gold") {
    household.goldSpent = { ...(household.goldSpent || {}), [kidId]: ((household.goldSpent || {})[kidId] || 0) + amount };
    return;
  }
  const bucket = { ...((household.currencySpent || {})[id] || {}), [kidId]: ((((household.currencySpent || {})[id] || {})[kidId]) || 0) + amount };
  household.currencySpent = { ...(household.currencySpent || {}), [id]: bucket };
}
