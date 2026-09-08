import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SAYINGS, formatSayingsText, householdSayings, parseSayingsText, sayingForDay } from '@chore-fridge/domain/sayings';

test('saying of the day is local, stable for a calendar day, and drawn from the shopkeeper list', () => {
  assert.ok(DEFAULT_SAYINGS.length >= 31);
  const first = sayingForDay('2026-09-08');
  assert.equal(sayingForDay('2026-09-08'), first);
  assert.equal(DEFAULT_SAYINGS.includes(first), true);
  assert.equal(DEFAULT_SAYINGS.includes(sayingForDay('2026-12-25')), true);
  const unique = new Set(DEFAULT_SAYINGS.map((_, i) => sayingForDay('2026-01-' + String(i + 1).padStart(2, '0'))));
  assert.ok(unique.size > 1);
});

test('household sayings parse a newline list, preserve an empty list, and pick from a custom list', () => {
  assert.deepEqual(parseSayingsText('  Hello shop  \n\nSecond line\n'), ['Hello shop', 'Second line']);
  assert.deepEqual(householdSayings(undefined), DEFAULT_SAYINGS);
  assert.deepEqual(householdSayings([]), []);
  assert.equal(formatSayingsText(['A', 'B']), 'A\nB');
  assert.equal(sayingForDay('2026-09-08', []), '');
  assert.equal(sayingForDay('2026-09-08', ['Only this one']), 'Only this one');
  assert.equal(sayingForDay('2026-09-08', ['Alpha', 'Beta']), sayingForDay('2026-09-08', ['Alpha', 'Beta']));
});
