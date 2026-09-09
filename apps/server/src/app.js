import { dayView, validDay } from '@chore-fridge/domain/day-view';
import { todayKey } from '@chore-fridge/domain/dates';
import { householdSayings } from '@chore-fridge/domain/sayings';
import { CURRENCY_IDS } from '@chore-fridge/domain/currencies';
import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { commandSchema } from '@chore-fridge/contracts/api';
import { openStorage } from './storage.js';
import { handleMcpRequest } from './mcp.js';

export async function createApp(options) {
  const storage = openStorage(options);
  const app = Fastify({logger:options.logger || false,bodyLimit:1_000_000,ajv:{customOptions:{coerceTypes:false,removeAdditional:false}},forceCloseConnections:true});
  app.decorate('storage',storage);
  const streams = new Set();
  app.addHook('onRequest',async (_request,reply) => { reply.header('Cache-Control','no-store'); });
  app.addHook('preClose',async () => { for (const stream of streams) stream.end(); });
  app.addHook('onClose',async () => { storage.close(); });
  app.get('/api/capabilities',async () => ({
    version:2,commands:true,events:true,taskHistory:true,dayBoard:true,appendOnlyLedger:true,
    mcp:true,mcpEnabled:!!storage.read().state?.mcpEnabled,mcpPath:'/mcp',
    legacyStateWrites:options.legacyWrites !== false,
  }));
  const requestedDay = request => {
    const day = request.query.day || todayKey();
    if (!validDay(day)) throw Object.assign(new Error('Invalid calendar day'),{statusCode:400});
    return day;
  };
  app.get('/api/board',async request => {
    const snapshot = storage.read();
    const board = dayView(snapshot.state,requestedDay(request),storage.ledger.totals());
    return board ? {...board,revision:snapshot.revision} : null;
  });
  app.get('/api/ledger',async request => {
    const after = request.query.after || '0';
    if (!/^[0-9]{1,15}$/.test(after)) throw Object.assign(new Error('Invalid ledger cursor'),{statusCode:400});
    const day = requestedDay(request);
    const entries = storage.ledger.list(day,Number(after));
    return {day,entries,next:entries.length === 100 ? entries.at(-1).sequence : null};
  });
  app.get('/api/state',async () => {
    const state = storage.read().state;
    return state ? {...state,creditLedger:state.creditProjection} : null;
  });
  app.put('/api/state',async (request,reply) => {
    if (options.legacyWrites === false) return reply.code(410).send({message:'Use /api/commands'});
    storage.putLegacy(request.body);
    return reply.code(204).send();
  });
  app.post('/api/import',async request => ({revision:storage.importLegacy(request.body).revision}));
  app.post('/api/commands',{schema:{body:commandSchema}},async request => {
    const {revision,result,replayed} = storage.command(request.body);
    return {revision,result,replayed};
  });
  for (const resource of ['kids','chores','rewards']) app.get('/api/'+resource,async () => storage.read().state?.[resource] || []);
  app.get('/api/sayings',async () => {
    const state = storage.read().state;
    return state ? householdSayings(state.sayings) : [];
  });
  app.get('/api/chores/archived',async () => storage.read().state?.archivedChores || []);
  app.get('/api/chores/:id/versions',async request => (storage.read().state?.taskVersions || []).filter(task => task.taskId === request.params.id));
  app.get('/api/history',{schema:{querystring:{type:'object',properties:{before:{type:'string',pattern:'^[0-9]{1,15}$'}}}}},async request => storage.history(request.query.before ? Number(request.query.before) : undefined));
  app.get('/api/history/:revision',{schema:{params:{type:'object',properties:{revision:{type:'string',pattern:'^[0-9]{1,15}$'}},required:['revision']}}},async (request,reply) => {
    const snapshot = storage.historical(Number(request.params.revision));
    return snapshot || reply.code(404).send({message:'Historical revision not found'});
  });
  app.get('/api/balances',async () => {
    const totals = storage.ledger.totals();
    return Object.fromEntries((storage.read().state?.kids || []).map(kid => {
      const total = totals[kid.id] || {};
      const amounts = { stars: Math.max(0, total.stars || total.star || 0), gold: Math.max(0, total.gold || 0) };
      for (const id of CURRENCY_IDS) {
        if (id === "star" || id === "gold") continue;
        const value = Math.max(0, Number(total[id]) || 0);
        if (value) amounts[id] = value;
      }
      return [kid.id, amounts];
    }));
  });
  app.route({
    method:['GET','POST','DELETE'],
    url:'/mcp',
    handler:(request,reply) => handleMcpRequest(storage,request,reply),
  });
  app.get('/api/events',(_request,reply) => {
    reply.hijack();
    const stream = reply.raw;
    stream.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    streams.add(stream);
    const send = revision => {
      if (!stream.destroyed && !stream.write(`id: ${revision}\ndata: ${JSON.stringify({revision})}\n\n`)) stream.destroy();
    };
    const heartbeat = setInterval(() => { if (!stream.destroyed && !stream.write(': heartbeat\n\n')) stream.destroy(); },15000);
    heartbeat.unref();
    storage.events.on('change',send);
    stream.on('close',() => { clearInterval(heartbeat); storage.events.off('change',send); streams.delete(stream); });
    send(storage.read().revision);
  });
  if (options.staticRoot && existsSync(options.staticRoot)) await app.register(staticFiles,{root:options.staticRoot,index:['index.html']});
  try { await app.ready(); return app; }
  catch (error) { await app.close(); throw error; }
}
