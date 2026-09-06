import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { commandSchema } from '@chore-fridge/contracts/api';
import { balancesFor } from '@chore-fridge/domain/balances';
import { defaultState } from '@chore-fridge/domain/state';
import { openStorage } from './storage.js';

export async function createApp(options) {
  const storage = openStorage(options);
  const app = Fastify({logger:options.logger || false,bodyLimit:1_000_000,ajv:{customOptions:{coerceTypes:false,removeAdditional:false}},forceCloseConnections:true});
  app.decorate('storage',storage);
  const streams = new Set();
  app.addHook('onRequest',async (_request,reply) => { reply.header('Cache-Control','no-store'); });
  app.addHook('preClose',async () => { for (const stream of streams) stream.end(); });
  app.addHook('onClose',async () => { storage.close(); });
  app.get('/api/capabilities',async () => ({version:2,commands:true,events:true,legacyStateWrites:options.legacyWrites !== false}));
  app.get('/api/state',async () => storage.read().state);
  app.put('/api/state',async (request,reply) => {
    if (options.legacyWrites === false) return reply.code(410).send({message:'Use /api/commands'});
    storage.putLegacy(request.body);
    return reply.code(204).send();
  });
  app.post('/api/import',async request => storage.importLegacy(request.body));
  app.post('/api/commands',{schema:{body:commandSchema}},async request => storage.command(request.body));
  for (const resource of ['kids','chores','rewards']) app.get('/api/'+resource,async () => storage.read().state?.[resource] || []);
  app.get('/api/balances',async () => balancesFor(storage.read().state || defaultState()));
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
