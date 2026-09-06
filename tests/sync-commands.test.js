import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/server/src/app.js';
import { defaultState } from '@chore-fridge/domain/state';

test('client imports browser data, retries lost responses without double spending, and reconciles other devices', async () => {
  const directory = mkdtempSync(join(tmpdir(),'chore-sync-'));
  const app = await createApp({databaseFile:join(directory,'state.sqlite'),legacyFile:join(directory,'state.json')});
  const originalFetch = globalThis.fetch;
  const cache = new Map();
  let loseResponse = false;
  const requests = [];
  globalThis.localStorage = {getItem:key => cache.get(key) || null,setItem:(key,value) => cache.set(key,value)};
  globalThis.fetch = async (url, options = {}) => {
    requests.push({url,options});
    const response = await app.inject({method:options.method || 'GET',url,headers:options.headers,payload:options.body});
    if (loseResponse && url === '/api/commands') { loseResponse = false; throw new Error('Response lost after commit'); }
    return {ok:response.statusCode >= 200 && response.statusCode < 300,status:response.statusCode,json:async () => response.json()};
  };
  globalThis.window = {fetch:globalThis.fetch};
  try {
    const initial = {...defaultState(),setupDone:true,kids:[{id:'kid',name:'Test'}],chores:[{id:'task',title:'Task',kidIds:['kid'],points:5,repeat:'daily'}],completions:{'2026-09-06:task:kid':1},rewards:[{id:'reward',title:'Prize',cost:2}]};
    cache.set('chore-fridge-v2',JSON.stringify(initial));
    const sync = await import('../apps/web/src/stores/sync.js');
    const rewards = await import('../apps/web/src/stores/rewards.js');
    const family = await import('../apps/web/src/stores/family.js');
    sync.loadLocal();
    await sync.pullServer();
    assert.equal(app.storage.read().state.kids[0].name,'Test');
    rewards.redeemReward('reward','kid');
    loseResponse = true;
    await sync.pullServer();
    assert.equal(app.storage.read().state.spent.kid,2);
    assert.equal(JSON.parse(cache.get('chore-fridge-v2-commands')).commands.length,1);
    await sync.pullServer();
    assert.equal(app.storage.read().state.spent.kid,2);
    const attempts = requests.filter(r => r.url === '/api/commands');
    assert.equal(attempts.length,2);
    assert.equal(attempts[0].options.body,attempts[1].options.body);
    assert.equal(JSON.parse(cache.get('chore-fridge-v2-commands')).commands.length,0);
    app.storage.command({id:'other-device',type:'kid.save',payload:{id:'kid',name:'Changed elsewhere'}});
    await sync.pullServer();
    assert.equal(family.$kids.get()[0].name,'Changed elsewhere');
    assert.equal(requests.some(r => r.options.method === 'PUT'),false);
    // A concurrent device can spend available credit before this optimistic action arrives.
    app.storage.command({id:'other-spend',type:'reward.redeem',payload:{kidId:'kid',rewardId:'reward'}});
    rewards.redeemReward('reward','kid');
    await sync.pullServer();
    assert.match(sync.$syncError.get(),/credit/);
    assert.equal(app.storage.read().state.spent.kid,4);
    assert.equal(sync.serializeHousehold().spent.kid,4);
    // Let the debounced save finish before closing the server.
    await new Promise(resolve => setTimeout(resolve,250));
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
    await app.close();
    rmSync(directory,{recursive:true,force:true});
  }
});
