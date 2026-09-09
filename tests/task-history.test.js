import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../apps/server/src/app.js';
import { defaultState } from '@chore-fridge/domain/state';
import { balancesFor } from '@chore-fridge/domain/balances';
const kid = {id:'kid',name:'Test'};
const task = {id:'task',title:'Trash',kidIds:['kid'],points:2,repeat:'daily',minCount:1,maxCount:1};
const seed = {...defaultState(),setupDone:true,kids:[kid],chores:[task]};
function options(t) {
  const dir = mkdtempSync(join(tmpdir(),'chore-history-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  return {databaseFile:join(dir,'state.sqlite'),legacyFile:join(dir,'state.json')};
}
async function command(app,id,type,payload) {
  const response = await app.inject({method:'POST',url:'/api/commands',payload:{id,type,payload}});
  assert.equal(response.statusCode,200,response.body);
  return {...response.json(),state:app.storage.read().state};
}

test('edits create immutable versions; archive and restore retain identity, credit, and historical snapshots', async t => {
  const config = options(t);
  let app = await createApp(config);
  app.storage.importLegacy(seed);
  const first = app.storage.read().state.chores[0];
  const done = await command(app,'monday','chore.complete',{choreId:'task',kidId:'kid',day:'2026-09-07',versionId:first.versionId});
  const edited = await command(app,'edit','chore.save',{...task,points:3,title:'Take out trash'});
  const second = edited.state.chores[0];
  assert.equal(second.taskId,first.taskId);
  assert.notEqual(second.versionId,first.versionId);
  assert.equal(balancesFor(edited.state).kid.stars,2);
  assert.deepEqual(edited.state.taskVersions[0],first);
  await command(app,'wednesday','chore.complete',{choreId:'task',kidId:'kid',day:'2026-09-09',versionId:second.versionId});
  // An offline completion still credits the exact version the device saw.
  const offline = await command(app,'offline','chore.complete',{choreId:'task',kidId:'kid',day:'2026-09-08',versionId:first.versionId});
  assert.equal(balancesFor(offline.state).kid.stars,7);
  const archived = await command(app,'archive','chore.remove',{id:'task'});
  assert.equal(archived.state.chores.length,0);
  assert.equal(archived.state.archivedChores[0].taskId,'task');
  assert.equal(balancesFor(archived.state).kid.stars,7);
  const missing = await app.inject({method:'POST',url:'/api/commands',payload:{id:'closed',type:'chore.complete',payload:{choreId:'task',kidId:'kid',day:'2026-09-10'}}});
  assert.equal(missing.statusCode,409);
  const restored = await command(app,'restore','chore.restore',{id:'task'});
  assert.equal(restored.state.chores[0].taskId,'task');
  assert.notEqual(restored.state.chores[0].versionId,second.versionId);
  assert.equal(restored.state.archivedChores.length,0);
  const historical = (await app.inject('/api/history/'+done.revision)).json().state;
  assert.equal(historical.chores[0].title,'Trash');
  assert.equal(balancesFor(historical).kid.stars,2);
  assert.equal((await app.inject('/api/chores/task/versions')).json().length,4);
  const length = app.storage.history().length;
  await command(app,'restore','chore.restore',{id:'task'});
  assert.equal(app.storage.history().length,length);
  await app.close();
  app = await createApp(config);
  try {
    assert.deepEqual(app.storage.historical(done.revision).state,historical);
    assert.equal(app.storage.read().state.taskVersions.length,4);
  } finally { await app.close(); }
});

test('counted credit keeps per-version values and undo reverses the latest unit without erasing history', async t => {
  const app = await createApp(options(t));
  try {
    app.storage.importLegacy({...seed,chores:[{...task,maxCount:3}]});
    const payload = {choreId:'task',kidId:'kid',day:'2026-09-07',delta:1};
    await command(app,'one','chore.count',payload);
    await command(app,'edit','chore.save',{...task,maxCount:3,points:3,gold:true});
    const two = await command(app,'two','chore.count',payload);
    assert.deepEqual(balancesFor(two.state).kid,{stars:2,gold:3});
    const entries = two.state.creditProjection['2026-09-07:task:kid'];
    assert.equal(entries.length,2);
    assert.notEqual(entries[0].versionId,entries[1].versionId);
    const undo = await command(app,'undo','chore.count',{...payload,delta:-1});
    assert.deepEqual(balancesFor(undo.state).kid,{stars:2,gold:0});
    assert.equal(app.storage.historical(two.revision).state.creditProjection['2026-09-07:task:kid'].length,2);
    await command(app,'unassign','chore.save',{...task,maxCount:3,kidIds:['kid'],points:100});
    assert.equal(balancesFor(app.storage.read().state).kid.stars,2);
  } finally { await app.close(); }
});

test('upgrades an existing schema-1 SQLite household once without recalculating known balances', async t => {
  const config = options(t);
  const original = {...seed,completions:{'2026-09-01:task:kid':1},counts:{'2026-09-02:task:kid':2},spent:{kid:1}};
  const db = new DatabaseSync(config.databaseFile);
  db.exec("CREATE TABLE household (id INTEGER PRIMARY KEY,document TEXT,revision INTEGER); CREATE TABLE migrations (name TEXT PRIMARY KEY,completed_at INTEGER); CREATE TABLE commands (id TEXT PRIMARY KEY,fingerprint TEXT,result TEXT); PRAGMA user_version=1;");
  db.prepare('INSERT INTO household VALUES(1,?,7)').run(JSON.stringify(original));
  db.prepare('INSERT INTO migrations VALUES(?,1)').run('legacy-json');
  db.close();
  let app = await createApp(config);
  const migrated = app.storage.read().state;
  assert.deepEqual(balancesFor(migrated),balancesFor(original));
  assert.equal(migrated.chores[0].taskId,'task');
  assert.equal(app.storage.history()[0].action,'migration.baseline');
  assert.equal(app.storage.history()[0].revision,7);
  await app.close();
  app = await createApp(config);
  try { assert.deepEqual(app.storage.read().state,migrated); assert.equal(app.storage.history().length,1); }
  finally { await app.close(); }
});

test('legacy writes cannot replace version history or revalue earned credits', async t => {
  const app = await createApp(options(t));
  try {
    app.storage.importLegacy(seed);
    await command(app,'done','chore.complete',{choreId:'task',kidId:'kid',day:'2026-09-07'});
    const old = app.storage.read().state;
    app.storage.putLegacy({...old,chores:[{...task,points:99}],taskVersions:[],creditProjection:{}});
    assert.equal(balancesFor(app.storage.read().state).kid.stars,2);
    assert.equal(app.storage.read().state.taskVersions.length,2);
    app.storage.putLegacy({...old,chores:[]});
    assert.equal(app.storage.read().state.archivedChores.length,1);
    assert.equal(balancesFor(app.storage.read().state).kid.stars,2);
  } finally { await app.close(); }
});
