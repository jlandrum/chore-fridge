import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../apps/server/src/app.js';
import { defaultState } from '@chore-fridge/domain/state';
import { initializeTaskHistory } from '@chore-fridge/domain/task-history';
import { balancesFor } from '@chore-fridge/domain/balances';
import { isDone, oneOffChores } from '@chore-fridge/domain/chores';
import { dayView } from '@chore-fridge/domain/day-view';

const day = '2026-09-09';
const kid = {id:'kid',name:'Alex'};
const task = {id:'task',title:'Task',kidIds:['kid'],points:2,repeat:'daily',maxCount:1,minCount:1};
const seed = () => ({...defaultState(),setupDone:true,kids:[kid],chores:[task],rewards:[{id:'reward',title:'Prize',cost:2}]});
function files(t) {
  const dir = mkdtempSync(join(tmpdir(),'chore-ledger-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  return {databaseFile:join(dir,'state.sqlite'),legacyFile:join(dir,'state.json')};
}
const act = (app,id,type,payload) => app.storage.command({id,type,payload});
const complete = {choreId:'task',kidId:'kid',day};

test('undo appends a linked reversal, redo a new credit, and retries do not duplicate journal rows', async t => {
  const options = files(t);
  let app = await createApp(options);
  app.storage.importLegacy(seed());
  act(app,'complete','chore.complete',complete);
  const original = app.storage.ledger.list(day)[0];
  act(app,'edit','chore.save',{...task,points:9});
  act(app,'undo','chore.undo',complete);
  const entries = app.storage.ledger.list(day);
  assert.deepEqual(entries[0],original);
  assert.equal(entries[1].kind,'reversal');
  assert.equal(entries[1].reverses,original.id);
  assert.equal(entries[1].stars,-2);
  assert.equal(entries[1].versionId,original.versionId);
  act(app,'redo','chore.complete',complete);
  assert.equal(app.storage.ledger.list(day)[2].stars,9);
  assert.deepEqual(app.storage.ledger.totals().kid,{stars:9,gold:0});
  await app.close();
  app = await createApp(options);
  try {
    act(app,'undo','chore.undo',complete);
    assert.equal(app.storage.ledger.list(day).length,3);
    const db = new DatabaseSync(options.databaseFile);
    try {
      assert.throws(() => db.exec('UPDATE ledger SET stars=100'),/append-only/);
      assert.throws(() => db.exec('DELETE FROM ledger'),/append-only/);
    } finally { db.close(); }
    assert.deepEqual(app.storage.ledger.list(day)[0],original);
  } finally { await app.close(); }
});

test('count reversals reference each original allocation and spending is a separate debit', async t => {
  const app = await createApp(files(t));
  try {
    app.storage.importLegacy({...seed(),chores:[{...task,maxCount:3}]});
    act(app,'one','chore.count',{...complete,delta:1});
    act(app,'edit','chore.save',{...task,maxCount:3,points:3,gold:true});
    act(app,'two','chore.count',{...complete,delta:1});
    const second = app.storage.ledger.list(day)[1];
    act(app,'minus','chore.count',{...complete,delta:-1});
    const reversal = app.storage.ledger.list(day)[2];
    assert.equal(reversal.reverses,second.id);
    assert.equal(reversal.stars,-3);
    assert.equal(reversal.gold,-1);
    act(app,'redeem','reward.redeem',{rewardId:'reward',kidId:'kid',day});
    assert.equal(app.storage.ledger.list(day)[3].kind,'redemption');
    assert.equal(app.storage.ledger.list(day)[3].stars,-2);
    assert.deepEqual(app.storage.ledger.totals().kid,{stars:0,gold:0});
    act(app,'minus-again','chore.count',{...complete,delta:-1});
    assert.equal(app.storage.ledger.totals().kid.stars,-2);
    assert.equal((await app.inject('/api/balances')).json().kid.stars,0);
    const priorRows = app.storage.ledger.list(day);
    act(app,'reset','household.reset',{});
    assert.deepEqual(app.storage.ledger.list(day).slice(0,priorRows.length),priorRows);
    assert.equal(app.storage.ledger.totals().kid.stars,0);
  } finally { await app.close(); }
});

test('schema-2 migration records opening credits/debits once and preserves the existing allocation values', async t => {
  const options = files(t);
  const state = initializeTaskHistory({...seed(),completions:{[day+':task:kid']:1},spent:{kid:1}});
  // Recreate the previous on-disk shape, whose mutable field was creditLedger.
  state.creditLedger = state.creditProjection; delete state.creditProjection;
  state.chores[0].points = 99;
  const db = new DatabaseSync(options.databaseFile);
  db.exec('CREATE TABLE household (id INTEGER PRIMARY KEY,document TEXT,revision INTEGER); CREATE TABLE migrations (name TEXT PRIMARY KEY,completed_at INTEGER); CREATE TABLE commands (id TEXT PRIMARY KEY,fingerprint TEXT,result TEXT); PRAGMA user_version=2;');
  db.prepare('INSERT INTO household VALUES(1,?,4)').run(JSON.stringify(state));
  for (const marker of ['legacy-json','task-history']) db.prepare('INSERT INTO migrations VALUES(?,1)').run(marker);
  db.close();
  let app = await createApp(options);
  assert.equal(app.storage.ledger.totals().kid.stars,1);
  const opening = app.storage.ledger.list(day)[0];
  assert.equal(opening.kind,'opening-credit');
  assert.equal(opening.stars,2);
  await app.close();
  app = await createApp(options);
  try {
    assert.equal(app.storage.ledger.totals().kid.stars,1);
    assert.deepEqual(app.storage.ledger.list(day)[0],opening);
    act(app,'undo','chore.undo',complete);
    assert.equal(app.storage.ledger.list(day).find(entry => entry.kind === 'reversal').reverses,opening.id);
  } finally { await app.close(); }
});

test('daily board omits old records, versions, archives and journal; weekly and once status still works', async t => {
  const app = await createApp(files(t));
  try {
    const chores = [task,{...task,id:'weekly',repeat:'weekly'},{...task,id:'once',repeat:'once'}];
    const completions = {'2026-09-07:weekly:kid':1,'2026-08-01:once:kid':1};
    for (let i=1;i<=28;i++) completions[`2026-02-${String(i).padStart(2,'0')}:task:kid`] = i;
    app.storage.importLegacy({...seed(),chores,completions});
    const response = await app.inject('/api/board?day='+day);
    const board = response.json();
    assert.equal(board.day,day);
    for (const key of Object.keys(board.completions)) assert.ok(key.startsWith(day+':'));
    for (const field of ['taskVersions','archivedChores','creditLedger','ledger','history']) assert.equal(field in board,false);
    assert.equal(isDone(board,chores[1],'kid',new Date(day+'T12:00:00')),true);
    assert.equal(isDone(board,chores[2],'kid',new Date(day+'T12:00:00')),true);
    assert.equal(oneOffChores(board).length,0);
    assert.deepEqual(balancesFor(board),balancesFor(app.storage.read().state));
    const nextDay = (await app.inject('/api/board?day=2026-09-14')).json();
    assert.equal(isDone(nextDay,chores[1],'kid',new Date('2026-09-14T12:00:00')),false);
    assert.equal((await app.inject('/api/board?day=2026-02-30')).statusCode,400);
    const receipt = await app.inject({method:'POST',url:'/api/commands',payload:{id:'complete',type:'chore.complete',payload:complete}});
    assert.deepEqual(Object.keys(receipt.json()).sort(),['replayed','result','revision']);
    assert.equal((await app.inject({method:'PUT',url:'/api/state',payload:board})).statusCode,400);
    const current = app.storage.read().state;
    const short = JSON.stringify(dayView(current,day,app.storage.ledger.totals()));
    current.taskVersions = Array(2000).fill(current.chores[0]);
    current.completions['2000-01-01:task:kid'] = 1;
    assert.equal(JSON.stringify(dayView(current,day,app.storage.ledger.totals())).length,short.length);
  } finally { await app.close(); }
});

test('ledger history is day-filtered and paginated; unrelated days never leak into the response', async t => {
  const app = await createApp(files(t));
  try {
    app.storage.importLegacy(seed());
    for (let i=0;i<102;i++) act(app,'tap-'+i,i%2 ? 'chore.undo' : 'chore.complete',complete);
    act(app,'other-day','chore.complete',{...complete,day:'2026-09-10'});
    const first = (await app.inject('/api/ledger?day='+day)).json();
    assert.equal(first.entries.length,100);
    assert.ok(first.entries.every(entry => entry.day === day));
    const last = (await app.inject('/api/ledger?day='+day+'&after='+first.next)).json();
    assert.equal(last.entries.length,2);
    assert.equal(last.next,null);
    assert.equal((await app.inject('/api/ledger?day=2026-02-30')).statusCode,400);
  } finally { await app.close(); }
});

test('a failed receipt rolls back journal, balance, state and history together', async t => {
  const options = files(t);
  const app = await createApp(options);
  try {
    app.storage.importLegacy(seed());
    const before = app.storage.read();
    const db = new DatabaseSync(options.databaseFile);
    db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON commands WHEN NEW.id='fail' BEGIN SELECT RAISE(ABORT,'Test receipt failure'); END;");
    db.close();
    assert.throws(() => act(app,'fail','chore.complete',complete),/receipt failure/);
    assert.deepEqual(app.storage.read(),before);
    assert.equal(app.storage.ledger.list(day).length,0);
    assert.equal(app.storage.ledger.totals().kid,undefined);
    assert.equal(app.storage.history().length,1);
    act(app,'works','chore.complete',complete);
    assert.equal(app.storage.ledger.list(day).length,1);
    assert.equal(app.storage.ledger.totals().kid.stars,2);
  } finally { await app.close(); }
});
