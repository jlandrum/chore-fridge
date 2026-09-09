import { createLedger } from './ledger.js';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, copyFileSync, constants } from 'node:fs';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import Ajv from 'ajv';
import { stateSchema, commandSchema } from '@chore-fridge/contracts/api';
import { defaultState } from '@chore-fridge/domain/state';
import { initializeTaskHistory, evolveTaskHistory } from '@chore-fridge/domain/task-history';
import { applyCommand } from '@chore-fridge/domain/commands';
import { mergeCompletions, mergeCounts } from '@chore-fridge/domain/history';

const ajv = new Ajv({allErrors:true});
const validState = ajv.compile(stateSchema);
const validCommand = ajv.compile(commandSchema);
export function validateState(data) {
  if (!validState(data)) throw Object.assign(new Error('Invalid household data: ' + ajv.errorsText(validState.errors)), {statusCode:400});
  if (data.dayScoped) throw Object.assign(new Error("A day view cannot replace or import a household"),{statusCode:400});
  return data;
}

export function openStorage({ databaseFile, legacyFile }) {
  mkdirSync(dirname(databaseFile), {recursive:true});
  const db = new DatabaseSync(databaseFile);
  const events = new EventEmitter();
  let ledger;
  events.setMaxListeners(0);
  const transaction = (action) => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = action(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 4) throw new Error('Database schema is newer than this server');
    transaction(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS household (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL, revision INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, completed_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS history (revision INTEGER PRIMARY KEY, recorded_at INTEGER NOT NULL, action TEXT NOT NULL, command_id TEXT, document TEXT NOT NULL);
        PRAGMA user_version=4;`);
      if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('legacy-json')) {
        if (!db.prepare('SELECT 1 FROM household WHERE id=1').get() && existsSync(legacyFile)) {
          const raw = readFileSync(legacyFile, 'utf8');
          const parsed = JSON.parse(raw);
          // A null legacy file represents an empty installation.
          if (parsed !== null) {
            validateState(parsed);
            const digest = createHash('sha256').update(raw).digest('hex').slice(0,16);
            const backup = legacyFile + '.pre-node-' + digest + '.bak';
            if (!existsSync(backup)) copyFileSync(legacyFile, backup, constants.COPYFILE_EXCL);
            else if (readFileSync(backup,'utf8') !== raw) throw new Error('Legacy backup does not match source');
            db.prepare('INSERT INTO household VALUES(1,?,1)').run(JSON.stringify({...defaultState(),...parsed}));
          }
        }
        db.prepare('INSERT INTO migrations VALUES(?,?)').run('legacy-json',Date.now());
      }
      if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('task-history')) {
        const row = db.prepare('SELECT * FROM household WHERE id=1').get();
        const at = Date.now();
        if (row) {
          const state = initializeTaskHistory(JSON.parse(row.document),at);
          db.prepare('UPDATE household SET document=? WHERE id=1').run(JSON.stringify(state));
          db.prepare('INSERT INTO history VALUES(?,?,?,?,?)').run(row.revision,at,'migration.baseline',null,JSON.stringify(state));
        }
        db.prepare('INSERT INTO migrations VALUES(?,?)').run('task-history',at);
      }
      ledger = createLedger(db);
      if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('append-only-ledger')) {
        const row = db.prepare('SELECT * FROM household WHERE id=1').get();
        if (row) {
          const state = JSON.parse(row.document);
          state.creditProjection = state.creditProjection || state.creditLedger || {};
          delete state.creditLedger;
          for (const entries of Object.values(state.creditProjection)) for (const entry of entries) delete entry.entryId;
          ledger.reconcile(null,state,row.revision,'migration.opening');
          db.prepare('UPDATE household SET document=? WHERE id=1').run(JSON.stringify(state));
        }
        db.prepare('INSERT INTO migrations VALUES(?,?)').run('append-only-ledger',Date.now());
      }
    });
  } catch (error) { db.close(); throw error; }
  function read() {
    const row = db.prepare('SELECT * FROM household WHERE id=1').get();
    return { state:row ? JSON.parse(row.document) : null, revision:row?.revision || 0 };
  }
  function write(state, action, commandId = null, day) {
    const previous = read();
    const revision = previous.revision + 1;
    ledger.reconcile(previous.state,state,revision,action,commandId,day);
    db.prepare('INSERT INTO household VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document, revision=excluded.revision').run(JSON.stringify(state),revision);
    db.prepare('INSERT INTO history VALUES(?,?,?,?,?)').run(revision,Date.now(),action,commandId,JSON.stringify(state));
    return {state,revision};
  }
  return {
    events, read, ledger,
    history(before = Number.MAX_SAFE_INTEGER) {
      return db.prepare('SELECT revision, recorded_at AS recordedAt, action, command_id AS commandId FROM history WHERE revision < ? ORDER BY revision DESC LIMIT 100').all(before);
    },
    historical(revision) {
      const row = db.prepare('SELECT * FROM history WHERE revision=?').get(revision);
      return row ? {revision:row.revision,recordedAt:row.recorded_at,action:row.action,state:JSON.parse(row.document)} : null;
    },
    command(command) {
      if (!validCommand(command)) throw Object.assign(new Error('Invalid command: ' + ajv.errorsText(validCommand.errors)),{statusCode:400});
      const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex');
      let changed = false;
      const response = transaction(() => {
        const previous = db.prepare('SELECT * FROM commands WHERE id=?').get(command.id);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw Object.assign(new Error('Command ID was already used for a different request'),{statusCode:409});
          return {...read(),result:JSON.parse(previous.result),replayed:true};
        }
        const {state,result} = applyCommand(read().state,command);
        const snapshot = write(state,command.type,command.id,command.payload.day);
        db.prepare('INSERT INTO commands VALUES(?,?,?)').run(command.id,fingerprint,JSON.stringify(result));
        changed = true;
        return {...snapshot,result,replayed:false};
      });
      if (changed) events.emit('change',response.revision);
      return response;
    },
    importLegacy(incoming) {
      validateState(incoming);
      const snapshot = transaction(() => {
        if (read().state) throw Object.assign(new Error('Household already exists'), {statusCode:409});
        return write(initializeTaskHistory({...defaultState(),...untrustedSnapshot(incoming)}),'household.import');
      });
      events.emit('change',snapshot.revision);
      return snapshot;
    },
    putLegacy(incoming) {
      validateState(incoming);
      const snapshot = transaction(() => {
        const current = read().state;
        const next = {...defaultState(),exchangeEarned:current?.exchangeEarned || {},rewardRedemptions:current?.rewardRedemptions || {},...untrustedSnapshot(incoming),
          completions:mergeCompletions(current?.completions,incoming.completions),
          counts:mergeCounts(current?.counts,incoming.counts)};
        const state = current ? evolveTaskHistory(current,next,{id:randomUUID(),type:'legacy.put'}) : initializeTaskHistory(next);
        return write(state,'legacy.put');
      });
      events.emit('change',snapshot.revision);
      return snapshot;
    },
    close() { events.removeAllListeners(); db.close(); },
  };
}

// These fields are server-owned even when an older client sends a full snapshot.
function untrustedSnapshot(incoming) {
  return Object.fromEntries(Object.entries(incoming).filter(([key]) => !['historyVersion','historyStartedAt','taskVersions','archivedChores','creditProjection','creditLedger','balanceCarry','day','dayScoped','pastOnce'].includes(key)));
}
