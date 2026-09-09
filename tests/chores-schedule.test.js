import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimedBy, isDone, isDueOn, normalizeChore, choresForKid } from '@chore-fridge/domain/chores';
import { normalizeCurrencies } from '@chore-fridge/domain/currencies';

const monday = new Date('2026-09-07T12:00:00');
const tuesday = new Date('2026-09-08T12:00:00');

test('daily chores appear only on selected weekdays', () => {
  const chore = normalizeChore({ id:'dishes', title:'Dishes', kidIds:['a'], repeat:'daily', weekdays:[1,3,5] });
  assert.equal(isDueOn(chore, monday), true);
  assert.equal(isDueOn(chore, tuesday), false);
  assert.deepEqual(chore.weekdays, [1, 3, 5]);
});

test('every N days, weeks, and months uses the saved anchor', () => {
  const days = normalizeChore({ id:'water', title:'Water', kidIds:['a'], repeat:'every', everyN:3, everyUnit:'days', anchorDay:'2026-09-07' });
  assert.equal(isDueOn(days, monday), true);
  assert.equal(isDueOn(days, tuesday), false);
  assert.equal(isDueOn(days, new Date('2026-09-10T12:00:00')), true);
  const weeks = normalizeChore({ id:'lawn', title:'Lawn', kidIds:['a'], repeat:'every', everyN:2, everyUnit:'weeks', anchorDay:'2026-09-07' });
  assert.equal(isDueOn(weeks, monday), true);
  assert.equal(isDueOn(weeks, new Date('2026-09-14T12:00:00')), false);
  assert.equal(isDueOn(weeks, new Date('2026-09-21T12:00:00')), true);
  const months = normalizeChore({ id:'filter', title:'Filter', kidIds:['a'], repeat:'every', everyN:1, everyUnit:'months', anchorDay:'2026-01-31' });
  assert.equal(isDueOn(months, new Date('2026-02-28T12:00:00')), true);
  assert.equal(isDueOn(months, new Date('2026-03-31T12:00:00')), true);
});

test('weekly shared claim greys the chore out for the other child', () => {
  const chore = normalizeChore({ id:'trash', title:'Trash', kidIds:['a','b'], repeat:'weekly', sharedClaim:true });
  const household = { chores:[chore], completions:{ '2026-09-07:trash:a': 1 }, counts:{} };
  assert.equal(claimedBy(household, chore, monday), 'a');
  assert.equal(isDone(household, chore, 'a', monday), true);
  assert.equal(isDone(household, chore, 'b', monday), true);
  assert.equal(choresForKid(household, 'b').length, 1);
});

test('custom currencies keep a chosen emoji while built-in ids stay fixed', () => {
  const next = normalizeCurrencies([
    { id: 'star', name: 'Star', enabled: true },
    { id: 'custom1', name: 'Stickers', enabled: true, emoji: '🎯' },
  ]);
  assert.equal(next.find(item => item.id === 'star').name, 'Star');
  assert.equal(next.find(item => item.id === 'custom1').emoji, '🎯');
  assert.equal(next.find(item => item.id === 'custom2').emoji, '②');
});
