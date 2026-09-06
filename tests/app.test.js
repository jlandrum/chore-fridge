import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost:5173' });
for (const key of ['window', 'document', 'HTMLElement', 'customElements', 'localStorage', 'Event', 'CustomEvent', 'navigator']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] });
}
window.fetch = null; // Component tests never contact household storage.
globalThis.confirm = () => true;
const store = await import('../src/state.js');
const view = await import('../src/view.js');
const { modal, toastEl, confettiEl, showToast } = await import('../src/ui.jsox');
await import('../src/app.jsox');
document.body.append(modal, toastEl, confettiEl);
const app = document.createElement('chore-fridge');
document.body.append(app);
const active = () => [...app.children].find(node => !node.hidden);
function click(label, scope = active()) {
  const button = [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === label);
  assert.ok(button, `Button exists: ${label}`);
  assert.equal(button.disabled, false, `Button enabled: ${label}`);
  button.click();
}
function field(label, value, scope = modal) {
  const wrapper = [...scope.querySelectorAll('.field')].find(node => node.querySelector('label')?.textContent === label);
  assert.ok(wrapper, `Field exists: ${label}`);
  wrapper.querySelector('input').value = value;
}
const pauseTap = () => new Promise(resolve => setTimeout(resolve, 290));

after(async () => {
  app.remove();
  clearTimeout(showToast.t);
  await window.happyDOM.abort();
});

test('onboarding, PIN, task editing, completion, rewards, themes, and reconnect', async () => {
  assert.equal(active().localName, 'fridge-setup');
  click('Set up the family');
  field('Name', 'Test Household', active());
  click('Next');
  field("Kid's name", 'Alex', active());
  click('Add kid');
  click('Next');
  field('4-digit PIN', '1234', active());
  click('Open the board');
  assert.equal(active().localName, 'fridge-board');
  assert.match(active().textContent, /Test Household/);
  assert.equal(active().querySelectorAll('fridge-kid').length, 1);
  click('Parent');
  for (const digit of '0000') click(digit);
  assert.equal(active().localName, 'fridge-pin');
  for (const digit of '1234') click(digit);
  assert.equal(active().localName, 'fridge-parent');
  click('Chores');
  click('Add');
  field('Task', 'Wash dishes');
  click('📅 Once a week', modal);
  assert.equal(modal.querySelector('fridge-choices').value, 'weekly');
  click('Save', modal);
  assert.equal(store.state.chores[0].repeat, 'weekly');
  assert.equal(store.state.chores[0].title, 'Wash dishes');
  click('Board');
  const column = active().querySelector('fridge-kid');
  const row = column.querySelector('fridge-chore');
  row.querySelector('button').click();
  assert.equal(store.starsFor(store.state.kids[0].id), 5);
  assert.match(row.querySelector('button').className, /done/);
  assert.equal(active().querySelector('fridge-kid'), column);
  assert.equal(column.querySelector('fridge-chore'), row);
  await pauseTap();
  row.querySelector('button').click();
  assert.equal(store.starsFor(store.state.kids[0].id), 0);
  await pauseTap();
  row.querySelector('button').click();
  store.saveReward({ id:'reward', title:'Treat', emoji:'🎁', cost:5, gold:false });
  active().querySelector('.reward').click();
  modal.querySelector('.choice').click();
  assert.equal(store.starsFor(store.state.kids[0].id), 0);
  store.saveReward({ ...store.state.rewards[0], title:'Updated treat' });
  assert.match(active().querySelector('.reward').textContent, /Updated treat/);
  click('View');
  click('Dark', modal);
  click('Cyberpunk', modal);
  assert.equal(document.documentElement.dataset.look, 'cyberpunk');
  assert.equal(document.documentElement.classList.contains('night'), true);
  modal.querySelector('[aria-label="Zoom in"]').click();
  assert.equal(view.getView().zoom, 110);
  click('Done', modal);
  click('View');
  assert.equal(modal.querySelector('.zoom-val').textContent, '110%');
  click('Done', modal);
  const childCount = app.children.length;
  app.remove();
  document.body.append(app);
  assert.equal(app.children.length, childCount);
  assert.equal(active().querySelector('fridge-kid'), column);
  assert.equal(column.querySelectorAll('fridge-chore').length, 1);
});

test('counted chores, multiple assignments, keyed reorder/removal, and empty board', async () => {
  const first = store.state.kids[0];
  const second = { id:'second', name:'Sam', emoji:'🐸', color:'#2a9d8f' };
  store.saveKid(second);
  const chore = store.saveChore({ title:'Practice', kidIds:[first.id, second.id], points:2, minCount:2, maxCount:3, gold:true });
  const board = active().querySelector('.board');
  const columns = [...board.children];
  const row = columns[0].querySelector(`[data-key="${chore.id}"]`);
  await pauseTap();
  row.querySelector('button').click();
  assert.equal(store.countFor(chore, first.id), 1);
  assert.equal(store.isDone(chore, first.id), false);
  await pauseTap();
  row.querySelector('button').click();
  assert.equal(store.isDone(chore, first.id), true);
  assert.equal(store.countFor(chore, second.id), 0);
  await pauseTap();
  row.querySelector('.mark').click();
  assert.equal(store.countFor(chore, first.id), 1);
  assert.equal(store.goldFor(first.id), 1);
  store.updateHousehold((draft) => { draft.kids.reverse(); });
  assert.equal(board.children[0], columns[1]);
  assert.equal(board.children[1], columns[0]);
  store.updateHousehold((draft) => { draft.kids = [first]; });
  assert.equal(board.children.length, 1);
  assert.equal(board.children[0], columns[0]);
  store.removeChore(chore.id);
  assert.equal(row.isConnected, false);
  store.updateHousehold((draft) => { draft.kids = []; });
  assert.match(board.textContent, /No kids yet/);
  assert.equal(board.children.length, 1);
});

test('multiple view controls stay synchronized and removed controls unsubscribe', () => {
  const one = document.createElement('fridge-view-controls');
  const two = document.createElement('fridge-view-controls');
  document.body.append(one, two);
  view.setTheme('light');
  click('Dark', one);
  const selected = two.querySelector('button[aria-pressed="true"]');
  assert.equal(selected.textContent, 'Dark');
  one.remove();
  view.setZoom(150);
  assert.equal(two.querySelector('[aria-label="Zoom in"]').disabled, true);
  assert.notEqual(one.querySelector('.zoom-val').textContent, '150%');
  document.body.append(one);
  assert.equal(one.querySelector('.zoom-val').textContent, '150%');
  assert.equal(one.querySelectorAll('.zoom-row').length, 1);
  one.remove();
  two.remove();
});

test('store snapshots and computed balances stay consistent without a refresh call', () => {
  const kid = { id:'reactive', name:'Riley', emoji:'🐻', color:'#e85d4c' };
  const before = store.$household.get();
  store.saveKid(kid);
  assert.equal(before.kids.length, 0);
  assert.equal(store.$household.get().kids.length, 1);
  assert.match(active().textContent, /Riley/);
  store.setUI({ view:'parent', parentTab:'kids' });
  const settings = active().querySelector('fridge-kids-settings');
  const row = settings.querySelector('fridge-kid-settings');
  const edit = row.querySelector('button');
  store.saveKid({ ...kid, name:'Renamed Riley' });
  assert.equal(settings.querySelector('fridge-kid-settings'), row);
  assert.equal(row.querySelector('button'), edit);
  assert.match(row.textContent, /Renamed Riley/);
  store.setUI({ parentTab:'display' });
  const display = active().querySelector('fridge-view-controls');
  store.saveKid({ ...kid, name:'Riley' });
  assert.equal(active().querySelector('fridge-view-controls'), display);
  store.setUI({ parentTab:'kids' });
  assert.equal(active().querySelector('fridge-kids-settings'), settings);
  app.remove();
  store.saveKid({ ...kid, name:'While disconnected' });
  assert.doesNotMatch(row.textContent, /While disconnected/);
  document.body.append(app);
  assert.match(row.textContent, /While disconnected/);
  store.setUI({ view:'board' });
});
