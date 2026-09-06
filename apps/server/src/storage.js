import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, copyFileSync, constants } from 'node:fs';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { stateSchema, commandSchema } from '@chore-fridge/contracts/api';
import { defaultState } from '@chore-fridge/domain/state';
import { applyCommand } from '@chore-fridge/domain/commands';
import { mergeCompletions, mergeCounts } from '@chore-fridge/domain/history';

const ajv = new Ajv({allErrors:true});
const validState = ajv.compile(stateSchema);
const validCommand = ajv.compile(commandSchema);
export function validateState(data) {
  if (!validState(data)) throw Object.assign(new Error('Invalid household data: ' + ajv.errorsText(validState.errors)), {statusCode:400});
  return data;
}

export function openStorage({ databaseFile, legacyFile }) {
  mkdirSync(dirname(databaseFile), {recursive:true});
  const db = new DatabaseSync(databaseFile);
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const transaction = (action) => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = action(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('Database schema is newer than this server');
    transaction(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS household (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL, revision INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, completed_at INTEGER NOT NULL);
        PRAGMA user_version=1;`);
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
    });
  } catch (error) { db.close(); throw error; }
  function read() {
    const row = db.prepare('SELECT * FROM household WHERE id=1').get();
    return { state:row ? JSON.parse(row.document) : null, revision:row?.revision || 0 };
  }
  function write(state) {
    const revision = read().revision + 1;
    db.prepare('INSERT INTO household VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document, revision=excluded.revision').run(JSON.stringify(state),revision);
    return {state,revision};
  }
  return {
    events, read,
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
        const snapshot = write(state);
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
        return write({...defaultState(),...incoming});
      });
      events.emit('change',snapshot.revision);
      return snapshot;
    },
    putLegacy(incoming) {
      validateState(incoming);
      const snapshot = transaction(() => {
        const current = read().state;
        return write({...defaultState(),...incoming,
          completions:mergeCompletions(current?.completions,incoming.completions),
          counts:mergeCounts(current?.counts,incoming.counts)});
      });
      events.emit('change',snapshot.revision);
      return snapshot;
    },
    close() { events.removeAllListeners(); db.close(); },
  };
}
