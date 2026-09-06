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
const { paint } = await import('../src/bus.js');
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
  paint();
  assert.equal(active().querySelector('fridge-kid'), column);
  assert.equal(column.querySelector('fridge-chore'), row);
  await pauseTap();
  row.querySelector('button').click();
  assert.equal(store.starsFor(store.state.kids[0].id), 0);
  await pauseTap();
  row.querySelector('button').click();
  store.state.rewards.push({ id:'reward', title:'Treat', emoji:'🎁', cost:5, gold:false });
  paint();
  active().querySelector('.reward').click();
  modal.querySelector('.choice').click();
  assert.equal(store.starsFor(store.state.kids[0].id), 0);
  store.state.rewards[0].title = 'Updated treat';
  paint();
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
  store.state.kids.push(second);
  const chore = store.saveChore({ title:'Practice', kidIds:[first.id, second.id], points:2, minCount:2, maxCount:3, gold:true });
  paint();
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
  store.state.kids.reverse();
  paint();
  assert.equal(board.children[0], columns[1]);
  assert.equal(board.children[1], columns[0]);
  store.state.kids = [first];
  paint();
  assert.equal(board.children.length, 1);
  assert.equal(board.children[0], columns[0]);
  store.removeChore(chore.id);
  paint();
  assert.equal(row.isConnected, false);
  store.state.kids = [];
  paint();
  assert.match(board.textContent, /No kids yet/);
  paint();
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
