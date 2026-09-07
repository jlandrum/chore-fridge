import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../apps/server/src/app.js';
import { openStorage } from '../apps/server/src/storage.js';
import { defaultState } from '@chore-fridge/domain/state';
import { balancesFor } from '@chore-fridge/domain/balances';

const kid = {id:'kid',name:'Test Kid',emoji:'🐻',color:'#e85d4c'};
const chore = {id:'task',title:'Test task',kidIds:['kid'],points:5,repeat:'daily',minCount:1,maxCount:1};
const seed = () => ({...defaultState(),setupDone:true,pin:'1234',familyName:'Test family',kids:[kid],chores:[chore],rewards:[{id:'reward',title:'Prize',cost:5}],updatedAt:1});
function files(t) {
  const directory = mkdtempSync(join(tmpdir(),'chore-node-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  return {directory,databaseFile:join(directory,'household.sqlite'),legacyFile:join(directory,'state.json')};
}
const command = (app,id,type,payload) => app.inject({method:'POST',url:'/api/commands',payload:{id,type,payload}});

test('automatically imports legacy data once, backs it up, and preserves newer SQLite state', async t => {
  const options = files(t);
  const data = {...seed(),completions:{'2026-09-01:task:kid':123,'2026-09-02:task:kid':-124},counts:{'2026-09-01:count:kid':2},spent:{kid:1},goldSpent:{kid:2},customField:'preserved'};
  const raw = JSON.stringify(data);
  writeFileSync(options.legacyFile,raw);
  let app = await createApp(options);
  const migrated = (await app.inject('/api/state')).json();
  for (const [key,value] of Object.entries(data)) {
    if (key !== 'chores') assert.deepEqual(migrated[key],value);
  }
  for (const [key,value] of Object.entries(data.chores[0])) assert.deepEqual(migrated.chores[0][key],value);
  assert.equal(migrated.chores[0].taskId,data.chores[0].id);
  assert.deepEqual((await app.inject('/api/balances')).json(),balancesFor(data));
  const backup = readdirSync(options.directory).find(name => name.endsWith('.bak'));
  assert.equal(readFileSync(join(options.directory,backup),'utf8'),raw);
  assert.equal(readFileSync(options.legacyFile,'utf8'),raw);
  assert.equal((await command(app,'edit','pin.set',{pin:'5678'})).statusCode,200);
  await app.close();
  writeFileSync(options.legacyFile,JSON.stringify({...data,pin:'9999'}));
  app = await createApp(options);
  try {
    assert.equal((await app.inject('/api/state')).json().pin,'5678');
    assert.equal((await command(app,'edit','pin.set',{pin:'5678'})).json().replayed,true);
    assert.equal(readdirSync(options.directory).filter(name => name.endsWith('.bak')).length,1);
  } finally { await app.close(); }
});

test('bad legacy files fail safely and can be repaired; newer database schemas are refused', async t => {
  const options = files(t);
  for (const raw of ['{broken',JSON.stringify({version:2}),JSON.stringify({version:1,kids:'bad'})]) {
    writeFileSync(options.legacyFile,raw);
    assert.throws(() => openStorage(options));
    assert.equal(readFileSync(options.legacyFile,'utf8'),raw);
  }
  writeFileSync(options.legacyFile,JSON.stringify(seed()));
  const storage = openStorage(options);
  assert.equal(storage.read().state.pin,'1234');
  storage.close();
  const db = new DatabaseSync(options.databaseFile);
  db.exec('PRAGMA user_version=99'); db.close();
  assert.throws(() => openStorage(options),/newer/);
});

test('commands validate, serialize competing redemptions, and deduplicate retries across restarts', async t => {
  const options = files(t);
  let app = await createApp(options);
  assert.equal((await app.inject('/api/state')).json(),null);
  assert.equal((await app.inject({method:'PUT',url:'/api/state',payload:seed()})).statusCode,204);
  const payload = {choreId:'task',kidId:'kid',day:'2026-09-06'};
  assert.equal((await command(app,'complete','chore.complete',payload)).statusCode,200);
  assert.equal((await command(app,'complete','chore.complete',payload)).json().replayed,true);
  assert.equal((await command(app,'complete','chore.undo',payload)).statusCode,409);
  assert.equal((await command(app,'bad-date','chore.complete',{...payload,day:'2026-02-30'})).statusCode,409);
  assert.equal((await command(app,'bad-kid','chore.complete',{...payload,kidId:'unknown'})).statusCode,409);
  assert.equal((await command(app,'bad-schema','pin.set',{pin:'a'})).statusCode,400);
  const replies = await Promise.all(['redeem-a','redeem-b'].map(id => command(app,id,'reward.redeem',{kidId:'kid',rewardId:'reward'})));
  assert.deepEqual(replies.map(r => r.statusCode).sort(),[200,409]);
  const winningId = replies[0].statusCode === 200 ? 'redeem-a' : 'redeem-b';
  await app.close();
  app = await createApp(options);
  try {
    assert.equal((await command(app,winningId,'reward.redeem',{kidId:'kid',rewardId:'reward'})).json().replayed,true);
    assert.equal((await app.inject('/api/state')).json().spent.kid,5);
    assert.equal((await app.inject('/api/balances')).json().kid.stars,0);
    await command(app,'count-task','chore.save',{...chore,id:'count',maxCount:2});
    for (let i=0;i<3;i++) assert.equal((await command(app,'count-'+i,'chore.count',{choreId:'count',kidId:'kid',day:payload.day,delta:1})).statusCode,200);
    assert.equal((await app.inject('/api/state')).json().counts['2026-09-06:count:kid'].n,2);
    await command(app,'undo','chore.undo',payload);
    assert.ok((await app.inject('/api/state')).json().completions['2026-09-06:task:kid'] < 0);
  } finally { await app.close(); }
});

test('legacy API merges tombstones and counts and can be disabled', async t => {
  const options = files(t);
  let app = await createApp(options);
  const data = {...seed(),completions:{x:-10},counts:{x:{n:2,t:10}}};
  await app.inject({method:'PUT',url:'/api/state',payload:data});
  await app.inject({method:'PUT',url:'/api/state',payload:{...data,completions:{x:5},counts:{x:{n:1,t:5}}}});
  const state = (await app.inject('/api/state')).json();
  assert.equal(state.completions.x,-10);
  assert.equal(state.counts.x.n,2);
  assert.equal((await app.inject({method:'PUT',url:'/api/state',payload:{version:2}})).statusCode,400);
  await app.close();
  app = await createApp({...options,legacyWrites:false});
  try { assert.equal((await app.inject({method:'PUT',url:'/api/state',payload:data})).statusCode,410); }
  finally { await app.close(); }
});

test('SSE announces committed revisions and disconnect releases its subscription', async t => {
  const app = await createApp(files(t));
  await app.listen({host:'127.0.0.1',port:0});
  const controller = new AbortController();
  try {
    const response = await fetch(app.listeningOrigin+'/api/events',{signal:controller.signal});
    const reader = response.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value),/"revision":0/);
    await command(app,'setup','setup.finish',{familyName:'Test',kids:[kid],pin:''});
    assert.match(new TextDecoder().decode((await reader.read()).value),/"revision":1/);
    controller.abort();
    await reader.cancel().catch(() => {});
    await new Promise(resolve => setTimeout(resolve,30));
    assert.equal(app.storage.events.listenerCount('change'),0);
  } finally { controller.abort(); await app.close(); }
});

test('one-time browser import cannot overwrite data and static serving exposes only built assets', async t => {
  const options = files(t);
  const { mkdirSync } = await import('node:fs');
  const staticRoot = join(options.directory,'dist');
  mkdirSync(staticRoot);
  writeFileSync(join(staticRoot,'index.html'),'<h1>Fridge</h1>');
  writeFileSync(join(options.directory,'private.txt'),'private');
  const app = await createApp({...options,staticRoot,legacyWrites:false});
  try {
    assert.equal((await app.inject({method:'POST',url:'/api/import',payload:seed()})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:'/api/import',payload:{...seed(),pin:'9999'}})).statusCode,409);
    assert.equal(app.storage.read().state.pin,'1234');
    assert.match((await app.inject('/')).body,/Fridge/);
    assert.equal((await app.inject('/private.txt')).statusCode,404);
    assert.equal((await app.inject('/api/state')).json().pin,'1234');
  } finally { await app.close(); }
});

test('parent completion preference is validated, persisted and included in daily responses', async t => {
  const options = files(t);
  let app = await createApp(options);
  app.storage.importLegacy(seed());
  assert.equal((await app.inject('/api/board')).json().requireParentModeForCompletion,false);
  assert.equal((await command(app,'require-parent','settings.update',{requireParentModeForCompletion:true})).statusCode,200);
  assert.equal((await command(app,'invalid-setting','settings.update',{requireParentModeForCompletion:'yes'})).statusCode,400);
  await app.close();
  app = await createApp(options);
  try {
    assert.equal((await app.inject('/api/board')).json().requireParentModeForCompletion,true);
    assert.equal(app.storage.read().state.requireParentModeForCompletion,true);
    assert.equal((await command(app,'allow-completion','settings.update',{requireParentModeForCompletion:false})).statusCode,200);
    assert.equal((await app.inject('/api/board')).json().requireParentModeForCompletion,false);
  } finally { await app.close(); }
});

test('redemption preference persists independently from task permissions', async t => {
  const options = files(t);
  let app = await createApp(options);
  app.storage.importLegacy(seed());
  assert.equal((await app.inject('/api/board')).json().requireParentModeForRedemptions,false);
  assert.equal((await command(app,'both-settings','settings.update',{requireParentModeForCompletion:true,requireParentModeForRedemptions:true})).statusCode,200);
  assert.equal((await command(app,'no-settings','settings.update',{})).statusCode,400);
  assert.equal((await command(app,'invalid-redeem-setting','settings.update',{requireParentModeForRedemptions:'yes'})).statusCode,400);
  await app.close();
  app = await createApp(options);
  try {
    const before = (await app.inject('/api/board')).json();
    assert.equal(before.requireParentModeForCompletion,true);
    assert.equal(before.requireParentModeForRedemptions,true);
    await command(app,'change-one-setting','settings.update',{requireParentModeForCompletion:false});
    assert.equal((await app.inject('/api/board')).json().requireParentModeForRedemptions,true);
    await command(app,'change-other-setting','settings.update',{requireParentModeForRedemptions:false});
    assert.equal((await app.inject('/api/board')).json().requireParentModeForCompletion,false);
  } finally { await app.close(); }
});
