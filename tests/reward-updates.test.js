import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '@chore-fridge/domain/state';
import { applyCommand } from '@chore-fridge/domain/commands';
import { balancesFor } from '@chore-fridge/domain/balances';
import { dayView } from '@chore-fridge/domain/day-view';
const now = new Date('2026-09-09T12:00:00').getTime();
const seed = () => ({...defaultState(),kids:[{id:'alex',name:'Alex'},{id:'sam',name:'Sam'}],exchangeEarned:{star:{alex:300,sam:300}},rewards:[{id:'exchange',title:'Pocket money',cost:100,currency:'star',currencyExchange:true,exchangeCurrency:'dollar',exchangeValue:5,oncePerDay:true}]});
const redeem = (state,kidId='alex',time=now) => applyCommand(state,{type:'reward.redeem',payload:{rewardId:'exchange',kidId}},time).state;
test('exchange moves both balances, daily limit is per child and resets tomorrow', () => {
  const first = redeem(seed());
  assert.deepEqual(balancesFor(first).alex,{stars:200,gold:0,dollar:5});
  assert.throws(() => redeem(first), /Already redeemed today/);
  const other = redeem(first,'sam');
  assert.equal(balancesFor(other).sam.dollar,5);
  const tomorrow = redeem(other,'alex',now+86400000);
  assert.equal(balancesFor(tomorrow).alex.dollar,10);
  assert.equal(balancesFor(tomorrow).alex.stars,100);
  assert.deepEqual(balancesFor(dayView(tomorrow,'2026-09-10',balancesFor(tomorrow))),balancesFor(tomorrow));
  assert.equal(Object.keys(dayView(tomorrow,'2026-09-10',balancesFor(tomorrow)).rewardRedemptions).length,1);
});
test('exchange rejects invalid payouts, insufficient funds, and backdated daily claims', () => {
  for (const patch of [{exchangeValue:0},{exchangeValue:1.5},{exchangeCurrency:'bad'},{exchangeCurrency:'star'}]) {
    assert.throws(() => applyCommand(seed(),{type:'reward.save',payload:{...seed().rewards[0],...patch}},now));
  }
  const poor=seed();poor.exchangeEarned={};
  assert.throws(() => redeem(poor), /Not enough credit/);
  assert.deepEqual(poor.spent,{});
  assert.throws(() => applyCommand(seed(),{type:'reward.redeem',payload:{rewardId:'exchange',kidId:'alex',day:'2026-09-08'}},now), /today/);
});
test('ordinary rewards preserve prior behavior and exchange payouts can be spent', () => {
  let state=redeem(seed());
  state.rewards.push({id:'treat',title:'Treat',cost:2,currency:'dollar'});
  for (let i=0;i<2;i++) state=applyCommand(state,{type:'reward.redeem',payload:{rewardId:'treat',kidId:'alex'}},now).state;
  assert.equal(balancesFor(state).alex.dollar,1);
});
