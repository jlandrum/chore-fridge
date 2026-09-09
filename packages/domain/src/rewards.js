import { CURRENCY_IDS, currencyId } from './currencies.js';

export function redemptionKey(rewardId, kidId, day) { return day + ':' + rewardId + ':' + kidId; }
export function alreadyRedeemed(records, rewardId, kidId, day) { return (records?.[redemptionKey(rewardId, kidId, day)] || 0) > 0; }
export function rewardValidation(reward) {
  if (!Number.isSafeInteger(reward.cost) || reward.cost < 1) return 'Cost must be a positive whole number';
  if (reward.currencyExchange) {
    if (!CURRENCY_IDS.includes(reward.exchangeCurrency)) return 'Choose a payout currency';
    if (reward.exchangeCurrency === currencyId(reward)) return 'Choose a different payout currency';
    if (!Number.isSafeInteger(reward.exchangeValue) || reward.exchangeValue < 1) return 'Payout must be a positive whole number';
  }
  return null;
}
