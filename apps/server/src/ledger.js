import { randomUUID } from 'node:crypto';
import { todayKey } from '@chore-fridge/domain/dates';

// The journal only accepts INSERT. Allocations and totals are projections,
// maintained in the same transaction as each command and its receipt.
export function createLedger(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ledger (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL, recorded_at INTEGER NOT NULL, day TEXT NOT NULL,
    kind TEXT NOT NULL, kid_id TEXT NOT NULL, task_id TEXT, version_id TEXT,
    completion_key TEXT, units REAL NOT NULL, stars REAL NOT NULL, gold REAL NOT NULL,
    reverses TEXT REFERENCES ledger(id), command_id TEXT);
    CREATE INDEX IF NOT EXISTS ledger_day ON ledger(day,sequence);
    CREATE TABLE IF NOT EXISTS balances (kid_id TEXT PRIMARY KEY, stars REAL NOT NULL, gold REAL NOT NULL);
    CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger is append-only'); END;`);
  function append({revision,day,kind,kidId,taskId=null,versionId=null,key=null,units=0,stars=0,gold=0,reverses=null,commandId=null}) {
    const id = randomUUID();
    db.prepare('INSERT INTO ledger (id,revision,recorded_at,day,kind,kid_id,task_id,version_id,completion_key,units,stars,gold,reverses,command_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,revision,Date.now(),day,kind,kidId,taskId,versionId,key,units,stars,gold,reverses,commandId);
    db.prepare('INSERT INTO balances VALUES(?,?,?) ON CONFLICT(kid_id) DO UPDATE SET stars=stars+excluded.stars,gold=gold+excluded.gold').run(kidId,stars,gold);
    return id;
  }
  function reconcile(previous,next,revision,action,commandId=null,day=todayKey()) {
    const old = previous?.creditProjection || {};
    const current = next.creditProjection || {};
    for (const key of new Set([...Object.keys(old),...Object.keys(current)])) {
      const before = old[key] || [];
      const after = current[key] || [];
      for (const entry of before) {
        const remaining = after.find(item => item.entryId === entry.entryId)?.units || 0;
        const removed = entry.units-remaining;
        if (removed > 0) append({revision,day,kind:'reversal',kidId:entry.kidId,taskId:entry.taskId,versionId:entry.versionId,key,units:-removed,stars:-removed*entry.points,gold:entry.gold ? -removed : 0,reverses:entry.entryId,commandId});
      }
      for (const entry of after) {
        if (!entry.entryId) entry.entryId = append({revision,day:previous ? day : key.split(':')[0],kind:previous ? 'credit' : 'opening-credit',kidId:entry.kidId,taskId:entry.taskId,versionId:entry.versionId,key,units:entry.units,stars:entry.units*entry.points,gold:entry.gold ? entry.units : 0,commandId});
      }
    }
    for (const [field,currency] of [['spent','stars'],['goldSpent','gold']]) {
      for (const kidId of new Set([...Object.keys(previous?.[field] || {}),...Object.keys(next[field] || {})])) {
        const amount = (previous?.[field]?.[kidId] || 0)-(next[field]?.[kidId] || 0);
        if (amount) append({revision,day,kind:previous ? (action === 'reward.redeem' ? 'redemption' : 'spending-adjustment') : 'opening-debit',kidId,[currency]:amount,commandId});
      }
    }
  }
  return {
    reconcile,
    totals() { return Object.fromEntries(db.prepare('SELECT * FROM balances').all().map(row => [row.kid_id,{stars:row.stars,gold:row.gold}])); },
    list(day,after=0) {
      return db.prepare('SELECT sequence,id,revision,recorded_at AS recordedAt,day,kind,kid_id AS kidId,task_id AS taskId,version_id AS versionId,completion_key AS completionKey,units,stars,gold,reverses,command_id AS commandId FROM ledger WHERE day=? AND sequence>? ORDER BY sequence LIMIT 100').all(day,after);
    },
  };
}
