import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../apps/server/src/app.js';
import { defaultState } from '@chore-fridge/domain/state';
import { applyCommand } from '@chore-fridge/domain/commands';
import { balancesFor } from '@chore-fridge/domain/balances';
import { dayView } from '@chore-fridge/domain/day-view';

const now = new Date('2026-11-10T12:00:00').getTime();
const day = '2026-11-10';
const tomorrow = new Date('2026-11-11T12:00:00').getTime();
const kids = [{id:'a', name:'Alex'}, {id:'b', name:'Sam'}];
const family = {id:'family', title:'Family Reward', cost:10, currency:'star', pooled:true, oncePerDay:true};
const seed = (patch = {}) => ({...defaultState(), kids, exchangeEarned:{star:{a:30, b:20}, gold:{a:5, b:3}}, rewards:[{...family}], ...patch});
const pay = (state, kidId, amount, time = now, extra = {}) => applyCommand(state, {type:'reward.contribute', payload:{rewardId:'family', kidId, amount, day, ...extra}}, time);

test('family payments split the cost, then the pool can be funded again', () => {
  const open = {...family, oncePerDay:false};
  let state = pay(seed({rewards:[open]}), 'a', 6).state;
  assert.equal(balancesFor(state).a.stars, 24);
  assert.deepEqual(state.rewardContributions.family, {a:6});
  assert.equal(state.spent.a, 6);
  state = pay(state, 'b', 4).state;
  assert.equal(state.rewardContributions.family, undefined);
  assert.equal(state.rewardRedemptions[day + ':family:*'], 1);
  assert.equal(balancesFor(state).a.stars, 24);
  assert.equal(balancesFor(state).b.stars, 16);
  state = pay(state, 'a', 1).state;
  assert.equal(state.rewardContributions.family.a, 1);
  const view = dayView(state, day, balancesFor(state));
  assert.deepEqual(view.rewardContributions.family, {a:1});
  assert.equal(balancesFor(view).a.stars, balancesFor(state).a.stars);
  assert.equal(balancesFor(view).b.stars, balancesFor(state).b.stars);
});

test('family payments reject overpay, empty balances, and a second completion the same day', () => {
  const start = seed();
  assert.throws(() => pay(start, 'b', 21), /Not enough credit/);
  assert.throws(() => pay(start, 'a', 1.5), /whole number/);
  assert.deepEqual(start.rewardContributions, {});
  let state = pay(start, 'a', 6).state;
  assert.throws(() => pay(state, 'b', 5), /remaining cost/);
  assert.equal(state.rewardContributions.family.a, 6);
  state = pay(state, 'b', 4).state;
  assert.throws(() => pay(state, 'a', 1), /Already redeemed today/);
  const next = applyCommand(state, {type:'reward.contribute', payload:{rewardId:'family', kidId:'a', amount:1, day:'2026-11-11'}}, tomorrow);
  assert.equal(next.state.rewardContributions.family.a, 1);
  assert.throws(() => applyCommand(seed(), {type:'reward.contribute', payload:{rewardId:'family', kidId:'a', amount:1, day:'2026-11-09'}}, now), /today/);
});

test('an open pool from yesterday can finish today, and gold uses the gold balance', () => {
  let state = seed();
  state.spent = {a:4};
  state.rewardContributions = {family:{a:4}};
  state = pay(state, 'b', 6).state;
  assert.equal(state.rewardContributions.family, undefined);
  assert.equal(state.rewardRedemptions[day + ':family:*'], 1);
  assert.equal(balancesFor(state).a.stars, 26);
  assert.equal(balancesFor(state).b.stars, 14);
  const gold = {id:'gold-family', title:'Gold family', cost:5, currency:'gold', pooled:true};
  state = applyCommand(seed({rewards:[gold]}), {type:'reward.contribute', payload:{rewardId:'gold-family', kidId:'a', amount:2, day}}, now).state;
  state = applyCommand(state, {type:'reward.contribute', payload:{rewardId:'gold-family', kidId:'b', amount:3, day}}, now).state;
  assert.equal(state.rewardRedemptions[day + ':gold-family:*'], 1);
  assert.equal(balancesFor(state).a.gold, 3);
  assert.equal(balancesFor(state).b.gold, 0);
  assert.equal(state.goldSpent.a, 2);
  assert.equal(state.goldSpent.b, 3);
});

test('family rewards reject a single redemption, currency exchange, a short cost, and closing the pool', () => {
  assert.throws(() => applyCommand(seed(), {type:'reward.redeem', payload:{rewardId:'family', kidId:'a', day}}, now), /paid in parts/);
  assert.throws(() => applyCommand(seed(), {type:'reward.save', payload:{...family, currencyExchange:true, exchangeCurrency:'dollar', exchangeValue:1}}, now), /cannot exchange/);
  const mid = pay(seed(), 'a', 6).state;
  assert.throws(() => applyCommand(mid, {type:'reward.save', payload:{...family, cost:5}}, now), /already paid/);
  assert.throws(() => applyCommand(mid, {type:'reward.save', payload:{...family, pooled:false}}, now), /single-person/);
  assert.equal(mid.rewards[0].pooled, true);
  assert.equal(mid.rewardContributions.family.a, 6);
  const kept = applyCommand(mid, {type:'reward.save', payload:{id:'family', title:'Family Reward', cost:10}}, now);
  assert.equal(kept.state.rewards[0].pooled, true);
  const done = applyCommand(mid, {type:'reward.save', payload:{...family, cost:6}}, now);
  assert.equal(done.result.completed, true);
  assert.equal(done.state.rewardContributions.family, undefined);
  assert.equal(done.state.rewardRedemptions[day + ':family:*'], 1);
  assert.equal(balancesFor(done.state).a.stars, 24);
});

test('returning a payment restores that balance, and removing the reward restores every payment', () => {
  let state = pay(seed(), 'a', 6).state;
  state = pay(state, 'b', 2).state;
  state = applyCommand(state, {type:'reward.return', payload:{rewardId:'family', kidId:'a', amount:2, day}}, now).state;
  assert.equal(state.rewardContributions.family.a, 4);
  assert.equal(balancesFor(state).a.stars, 26);
  assert.throws(() => applyCommand(state, {type:'reward.return', payload:{rewardId:'family', kidId:'a', amount:9, day}}, now), /not in this reward/);
  state = applyCommand(state, {type:'reward.return', payload:{rewardId:'family', kidId:'b', day}}, now).state;
  assert.equal(state.rewardContributions.family.b, undefined);
  assert.equal(balancesFor(state).b.stars, 20);
  const removed = applyCommand(state, {type:'reward.remove', payload:{id:'family'}}, now);
  assert.equal(removed.state.rewards.length, 0);
  assert.equal(removed.state.rewardContributions.family, undefined);
  assert.equal(balancesFor(removed.state).a.stars, 30);
});

function files(t) {
  const dir = mkdtempSync(join(tmpdir(), 'chore-pool-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  return {databaseFile:join(dir, 'state.sqlite'), legacyFile:join(dir, 'state.json')};
}

test('contributions, returns, and removals are journaled against the reward', async t => {
  const app = await createApp(files(t));
  try {
    const open = {...family, oncePerDay:false};
    app.storage.importLegacy(seed({rewards:[open, {id:'gold-family', title:'Gold family', cost:3, currency:'gold', pooled:true}]}));
    const first = app.storage.command({id:'pay-a', type:'reward.contribute', payload:{rewardId:'family', kidId:'a', amount:6, day}});
    assert.equal(first.result.completed, undefined);
    const row = app.storage.ledger.list(day).find(entry => entry.kind === 'contribution' && entry.rewardId === 'family');
    assert.equal(row.stars, -6);
    assert.equal(row.gold, 0);
    assert.equal(row.currency, '');
    assert.equal(app.storage.ledger.totals().a.stars, balancesFor(app.storage.read().state).a.stars);
    const board = (await app.inject('/api/board?day=' + day)).json();
    assert.deepEqual(board.rewardContributions.family, {a:6});
    assert.equal(balancesFor(board).a.stars, balancesFor(app.storage.read().state).a.stars);
    app.storage.command({id:'back', type:'reward.return', payload:{rewardId:'family', kidId:'a', amount:1, day}});
    const returned = app.storage.ledger.list(day).find(entry => entry.kind === 'contribution-return');
    assert.equal(returned.stars, 1);
    assert.equal(returned.rewardId, 'family');
    assert.equal(app.storage.ledger.totals().a.stars, 25);
    const wiped = {...app.storage.read().state, rewardContributions:{}};
    assert.equal((await app.inject({method:'PUT', url:'/api/state', payload:wiped})).statusCode, 204);
    assert.deepEqual(app.storage.read().state.rewardContributions.family, {a:5});
    app.storage.command({id:'gold', type:'reward.contribute', payload:{rewardId:'gold-family', kidId:'a', amount:2, day}});
    const goldRow = app.storage.ledger.list(day).find(entry => entry.rewardId === 'gold-family');
    assert.equal(goldRow.kind, 'contribution');
    assert.equal(goldRow.gold, -2);
    assert.equal(goldRow.stars, 0);
    assert.equal(goldRow.currency, 'gold');
    app.storage.command({id:'drop', type:'reward.remove', payload:{id:'family'}});
    const refund = app.storage.ledger.list(day).filter(entry => entry.kind === 'contribution-return' && entry.commandId === 'drop');
    assert.equal(refund.length, 1);
    assert.equal(refund[0].stars, 5);
    assert.equal(refund[0].rewardId, 'family');
    assert.equal(app.storage.ledger.totals().a.stars, 30);
    assert.equal((await app.inject({method:'POST', url:'/api/commands', payload:{id:'zero', type:'reward.contribute', payload:{rewardId:'gold-family', kidId:'a', amount:0, day}}})).statusCode, 400);
  } finally { await app.close(); }
});

test('an existing ledger gains a reward id column', async t => {
  const options = files(t);
  const db = new DatabaseSync(options.databaseFile);
  db.exec(`CREATE TABLE ledger (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL, recorded_at INTEGER NOT NULL, day TEXT NOT NULL,
    kind TEXT NOT NULL, kid_id TEXT NOT NULL, task_id TEXT, version_id TEXT,
    completion_key TEXT, units REAL NOT NULL, stars REAL NOT NULL, gold REAL NOT NULL,
    reverses TEXT, command_id TEXT, currency TEXT NOT NULL DEFAULT '');
    PRAGMA user_version=4;`);
  db.close();
  const app = await createApp(options);
  try {
    const check = new DatabaseSync(options.databaseFile);
    const names = check.prepare('PRAGMA table_info(ledger)').all().map(column => column.name);
    check.close();
    assert.ok(names.includes('reward_id'));
  } finally { await app.close(); }
});
