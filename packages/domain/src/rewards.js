import { CURRENCY_IDS, currencyId } from './currencies.js';
import { amountFor } from './balances.js';

export function redemptionKey(rewardId, kidId, day) { return day + ':' + rewardId + ':' + kidId; }
export function alreadyRedeemed(records, rewardId, kidId, day) { return (records?.[redemptionKey(rewardId, kidId, day)] || 0) > 0; }

function sanitizeCostRow(row) {
  const currency = currencyId(row);
  const amount = Number(row?.amount);
  if (!CURRENCY_IDS.includes(currency) || !Number.isSafeInteger(amount) || amount < 1) return null;
  return { currency, amount };
}

export function rewardCosts(reward) {
  const listed = Array.isArray(reward?.costs) ? reward.costs.map(sanitizeCostRow).filter(Boolean) : [];
  const unique = [];
  const seen = new Set();
  for (const row of listed) {
    if (seen.has(row.currency)) continue;
    seen.add(row.currency);
    unique.push(row);
  }
  if (unique.length) return unique;
  const amount = Number(reward?.cost);
  if (Number.isSafeInteger(amount) && amount >= 1) return [{ currency: currencyId(reward), amount }];
  return [];
}

export function shareAmount(share, currency) {
  if (share == null) return 0;
  if (typeof share === 'number') return share;
  return Number(share[currency]) || 0;
}

export function poolPaidIn(pool, currency) {
  return Object.values(pool || {}).reduce((sum, share) => sum + shareAmount(share, currency), 0);
}

export function poolPaid(pool) {
  return Object.values(pool || {}).reduce((sum, share) => {
    if (share && typeof share === 'object') {
      return sum + Object.values(share).reduce((inner, value) => inner + (Number(value) || 0), 0);
    }
    return sum + (Number(share) || 0);
  }, 0);
}

export function poolComplete(reward, pool) {
  const costs = rewardCosts(reward);
  return costs.length > 0 && costs.every((row) => poolPaidIn(pool, row.currency) >= row.amount);
}

export function canAffordReward(balance, reward) {
  return rewardCosts(reward).every((row) => amountFor(balance, row.currency) >= row.amount);
}

export function rewardValidation(reward) {
  const costs = rewardCosts(reward);
  if (!costs.length) return 'Cost must be a positive whole number';
  if (reward.pooled && reward.currencyExchange) return 'A family reward cannot exchange currency';
  if (reward.currencyExchange) {
    if (!CURRENCY_IDS.includes(reward.exchangeCurrency)) return 'Choose a payout currency';
    if (costs.some((row) => row.currency === reward.exchangeCurrency)) return 'Choose a different payout currency';
    if (!Number.isSafeInteger(reward.exchangeValue) || reward.exchangeValue < 1) return 'Payout must be a positive whole number';
  }
  return null;
}
