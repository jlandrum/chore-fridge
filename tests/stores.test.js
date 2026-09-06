import { test } from 'node:test';
import assert from 'node:assert/strict';
import { $kids, $pin, saveKid, setPin } from '../apps/web/src/stores/family.js';
import { $chores, $counts, $completions, saveChore, toggleChore } from '../apps/web/src/stores/chores.js';
import { $rewards, saveReward } from '../apps/web/src/stores/rewards.js';
import { $balances } from '../apps/web/src/stores/balances.js';
import { $ui, setUI } from '../apps/web/src/stores/navigation.js';
import { $setup } from '../apps/web/src/stores/setup.js';
import { defaultState, serializeHousehold, applySnapshot } from '../apps/web/src/stores/sync.js';

// No network and no household files; only the real store/persistence boundary.
globalThis.window = { fetch: null };
globalThis.localStorage = { setItem() {}, getItem() { return null; } };

test('actions retain unrelated snapshots and notify only affected domains', () => {
  applySnapshot(defaultState());
  saveKid({ id:'kid', name:'Alex' });
  const chore = saveChore({ title:'Task', kidIds:['kid'], points:5 });
  const before = serializeHousehold();
  const calls = { kids:0, chores:0, counts:0, completions:0, rewards:0, balances:0 };
  const stops = Object.entries({ kids:$kids, chores:$chores, counts:$counts, completions:$completions, rewards:$rewards, balances:$balances })
    .map(([key, store]) => store.listen(() => { calls[key]++; }));
  try {
    saveReward({ id:'reward', title:'Treat', cost:5 });
    assert.deepEqual(calls, { kids:0, chores:0, counts:0, completions:0, rewards:1, balances:0 });
    setPin('1234');
    setUI({ view:'parent' });
    assert.deepEqual(calls, { kids:0, chores:0, counts:0, completions:0, rewards:1, balances:0 });
    toggleChore(chore.id, 'kid');
    assert.equal(calls.completions, 1);
    assert.equal(calls.balances, 1);
    assert.equal($balances.get().kid.stars, 5);
    assert.equal($kids.get(), before.kids);
    assert.equal($chores.get(), before.chores);
    assert.equal($counts.get(), before.counts);
    assert.deepEqual(before.completions, {});
    assert.deepEqual(before.rewards, []);
  } finally { stops.forEach(stop => stop()); }
});

test('remote snapshots retain unchanged domains and preserve the existing envelope', () => {
  const previous = serializeHousehold();
  const incoming = JSON.parse(JSON.stringify(previous));
  incoming.rewards[0].title = 'Remote reward';
  incoming.nightMode = 'on';
  incoming.updatedAt += 1000;
  incoming.futureField = { preserved:true };
  let choreNotifications = 0;
  const stop = $chores.listen(() => { choreNotifications++; });
  try {
    applySnapshot(incoming);
    assert.equal(choreNotifications, 0);
    assert.equal($chores.get(), previous.chores);
    assert.equal($kids.get(), previous.kids);
    assert.equal($completions.get(), previous.completions);
    assert.equal($rewards.get()[0].title, 'Remote reward');
    const document = serializeHousehold();
    assert.deepEqual(document, incoming);
    assert.equal(document.pin, $pin.get());
    assert.equal('ui' in document, false);
    assert.equal('view' in document, false);
    assert.equal('picked' in $setup.get(), false);
  } finally { stop(); }
});
