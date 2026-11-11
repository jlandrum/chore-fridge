import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '@chore-fridge/domain/commands';
import { defaultState } from '@chore-fridge/domain/state';
import { balancesFor } from '@chore-fridge/domain/balances';
import { rewardCosts } from '@chore-fridge/domain/rewards';

const now = new Date('2026-11-10T12:00:00').getTime();
const day = '2026-11-10';
const kids = [{id:'a', name:'Alex'}, {id:'b', name:'Sam'}];
const seed = (patch = {}) => ({...defaultState(), kids, exchangeEarned:{star:{a:20, b:8}, gold:{a:3, b:1}}, ...patch});

test('a reward can cost more than one currency', () => {
  const saved = applyCommand(seed(), {type:'reward.save', payload:{id:'combo', title:'Movie', cost:5, currency:'star', costs:[{currency:'star', amount:5},{currency:'gold', amount:2}]}}, now);
  assert.deepEqual(rewardCosts(saved.state.rewards[0]), [{currency:'star', amount:5},{currency:'gold', amount:2}]);
  assert.equal(saved.state.rewards[0].cost, 5);
  assert.equal(saved.state.rewards[0].currency, 'star');
  const paid = applyCommand(saved.state, {type:'reward.redeem', payload:{rewardId:'combo', kidId:'a', day}}, now);
  assert.equal(balancesFor(paid.state).a.stars, 15);
  assert.equal(balancesFor(paid.state).a.gold, 1);
  assert.throws(() => applyCommand(saved.state, {type:'reward.redeem', payload:{rewardId:'combo', kidId:'b', day}}, now), /Not enough credit/);
});

test('family rewards can collect each cost currency separately', () => {
  const reward = {id:'family', title:'Trip', cost:4, currency:'star', pooled:true, costs:[{currency:'star', amount:4},{currency:'gold', amount:2}]};
  let state = applyCommand(seed({rewards:[reward]}), {type:'reward.contribute', payload:{rewardId:'family', kidId:'a', amount:4, currency:'star', day}}, now).state;
  assert.deepEqual(state.rewardContributions.family.a, {star:4});
  assert.equal(state.rewardRedemptions[day + ':family:*'], undefined);
  state = applyCommand(state, {type:'reward.contribute', payload:{rewardId:'family', kidId:'b', amount:1, currency:'gold', day}}, now).state;
  state = applyCommand(state, {type:'reward.contribute', payload:{rewardId:'family', kidId:'a', amount:1, currency:'gold', day}}, now).state;
  assert.equal(state.rewardContributions.family, undefined);
  assert.equal(state.rewardRedemptions[day + ':family:*'], 1);
  assert.equal(balancesFor(state).a.stars, 16);
  assert.equal(balancesFor(state).a.gold, 2);
  assert.equal(balancesFor(state).b.gold, 0);
});

test('exchange payout cannot reuse a cost currency', () => {
  assert.throws(() => applyCommand(seed(), {type:'reward.save', payload:{id:'bad', title:'Bad', cost:5, currency:'star', costs:[{currency:'star', amount:5},{currency:'gold', amount:1}], currencyExchange:true, exchangeCurrency:'gold', exchangeValue:2}}, now), /different payout currency/);
});
