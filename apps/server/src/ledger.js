import { randomUUID } from 'node:crypto';
import { todayKey } from '@chore-fridge/domain/dates';
import { creditValue } from '@chore-fridge/domain/balances';
import { CURRENCY_IDS, currencyId, spentFor } from '@chore-fridge/domain/currencies';

// The journal only accepts INSERT. Allocations and totals are projections,
// maintained in the same transaction as each command and its receipt.
export function createLedger(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ledger (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL, recorded_at INTEGER NOT NULL, day TEXT NOT NULL,
    kind TEXT NOT NULL, kid_id TEXT NOT NULL, task_id TEXT, version_id TEXT,
    completion_key TEXT, units REAL NOT NULL, stars REAL NOT NULL, gold REAL NOT NULL,
    reverses TEXT REFERENCES ledger(id), command_id TEXT, currency TEXT NOT NULL DEFAULT '',
    reward_id TEXT);
    CREATE INDEX IF NOT EXISTS ledger_day ON ledger(day,sequence);
    CREATE TABLE IF NOT EXISTS balances (kid_id TEXT PRIMARY KEY, stars REAL NOT NULL, gold REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS extra_balances (kid_id TEXT NOT NULL, currency TEXT NOT NULL, amount REAL NOT NULL, PRIMARY KEY(kid_id, currency));
    CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger is append-only'); END;`);
  const columns = db.prepare('PRAGMA table_info(ledger)').all().map(column => column.name);
  if (!columns.includes('currency')) db.exec("ALTER TABLE ledger ADD COLUMN currency TEXT NOT NULL DEFAULT ''");
  if (!columns.includes('reward_id')) db.exec('ALTER TABLE ledger ADD COLUMN reward_id TEXT');
  function pack(entry, units) {
    const value = creditValue({ ...entry, units });
    const id = currencyId(entry);
    return {
      stars: id === "gold" ? 0 : value[id],
      gold: id === "gold" ? value.gold : 0,
      currency: id === "star" ? "" : id,
    };
  }
  function append({revision,day,kind,kidId,taskId=null,versionId=null,key=null,units=0,stars=0,gold=0,currency='',reverses=null,commandId=null,rewardId=null}) {
    const id = randomUUID();
    db.prepare('INSERT INTO ledger (id,revision,recorded_at,day,kind,kid_id,task_id,version_id,completion_key,units,stars,gold,reverses,command_id,currency,reward_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,revision,Date.now(),day,kind,kidId,taskId,versionId,key,units,stars,gold,reverses,commandId,currency || '',rewardId);
    if (currency && currency !== 'star' && currency !== 'gold') {
      db.prepare('INSERT INTO extra_balances VALUES(?,?,?) ON CONFLICT(kid_id,currency) DO UPDATE SET amount=amount+excluded.amount').run(kidId,currency,stars);
    } else {
      db.prepare('INSERT INTO balances VALUES(?,?,?) ON CONFLICT(kid_id) DO UPDATE SET stars=stars+excluded.stars,gold=gold+excluded.gold').run(kidId,stars,gold);
    }
    return id;
  }
  function reconcile(previous,next,revision,action,commandId=null,day=todayKey(),rewardId=null) {
    const old = previous?.creditProjection || {};
    const current = next.creditProjection || {};
    for (const key of new Set([...Object.keys(old),...Object.keys(current)])) {
      const before = old[key] || [];
      const after = current[key] || [];
      for (const entry of before) {
        const remaining = after.find(item => item.entryId === entry.entryId)?.units || 0;
        const removed = entry.units-remaining;
        if (removed > 0) {
          const packed = pack(entry, -removed);
          append({revision,day,kind:'reversal',kidId:entry.kidId,taskId:entry.taskId,versionId:entry.versionId,key,units:-removed,...packed,reverses:entry.entryId,commandId});
        }
      }
      for (const entry of after) {
        if (!entry.entryId) {
          const packed = pack(entry, entry.units);
          entry.entryId = append({revision,day:previous ? day : key.split(':')[0],kind:previous ? 'credit' : 'opening-credit',kidId:entry.kidId,taskId:entry.taskId,versionId:entry.versionId,key,units:entry.units,...packed,commandId});
        }
      }
    }
    for (const currency of CURRENCY_IDS) {
      const before = previous?.exchangeEarned?.[currency] || {};
      const after = next.exchangeEarned?.[currency] || {};
      for (const kidId of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const amount = (after[kidId] || 0) - (before[kidId] || 0);
        if (!amount) continue;
        const packed = currency === 'gold' ? {stars:0,gold:amount,currency:'gold'} : {stars:amount,gold:0,currency:currency === 'star' ? '' : currency};
        append({revision,day,kind:previous ? 'exchange-credit' : 'opening-credit',kidId,...packed,commandId,rewardId});
      }

      const kids = new Set([...Object.keys(spentKids(previous, currency)), ...Object.keys(spentKids(next, currency))]);
      for (const kidId of kids) {
        const amount = spentFor(previous || {}, currency, kidId) - spentFor(next, currency, kidId);
        if (!amount) continue;
        const packed = currency === 'gold' ? { stars: 0, gold: amount, currency: 'gold' } : { stars: amount, gold: 0, currency: currency === 'star' ? '' : currency };
        append({revision,day,kind:spendingKind(action, previous),kidId,...packed,commandId,rewardId});
      }
    }
  }
  return {
    reconcile,
    totals() {
      const result = {};
      for (const row of db.prepare('SELECT * FROM balances').all()) {
        result[row.kid_id] = { stars: row.stars, gold: row.gold };
      }
      for (const row of db.prepare('SELECT * FROM extra_balances').all()) {
        result[row.kid_id] = result[row.kid_id] || { stars: 0, gold: 0 };
        result[row.kid_id][row.currency] = row.amount;
      }
      return result;
    },
    list(day,after=0) {
      return db.prepare('SELECT sequence,id,revision,recorded_at AS recordedAt,day,kind,kid_id AS kidId,task_id AS taskId,version_id AS versionId,completion_key AS completionKey,units,stars,gold,reverses,command_id AS commandId,currency,reward_id AS rewardId FROM ledger WHERE day=? AND sequence>? ORDER BY sequence LIMIT 100').all(day,after);
    },
    // Undo used to recompute a legacy gold credit as zero points and leave the awarded star in the balance.
    // Summing every reversal of a credit makes a repeated repair append nothing.
    repairIncompleteReversals(revision) {
      const originals = db.prepare('SELECT * FROM ledger WHERE id IN (SELECT reverses FROM ledger WHERE reverses IS NOT NULL)').all();
      const summed = new Map(db.prepare('SELECT reverses AS id, SUM(units) AS units, SUM(stars) AS stars, SUM(gold) AS gold FROM ledger WHERE reverses IS NOT NULL GROUP BY reverses').all().map(row => [row.id, row]));
      const sample = db.prepare('SELECT * FROM ledger WHERE reverses=? ORDER BY sequence DESC LIMIT 1');
      for (const original of originals) {
        if (!original.units) continue;
        const sum = summed.get(original.id);
        const scale = sum.units / original.units;
        const stars = original.stars * scale - sum.stars;
        const gold = original.gold * scale - sum.gold;
        if (Math.abs(stars) < 1e-9 && Math.abs(gold) < 1e-9) continue;
        const source = sample.get(original.id);
        const currency = Math.abs(gold) >= 1e-9 && Math.abs(stars) < 1e-9 ? 'gold' : (source.currency || '');
        append({revision,day:source.day,kind:'reversal',kidId:source.kid_id,taskId:source.task_id,versionId:source.version_id,key:source.completion_key,units:0,stars,gold,currency,reverses:original.id,commandId:source.command_id});
      }
    },
  };
}

function spendingKind(action, previous) {
  if (!previous) return 'opening-debit';
  if (action === 'reward.redeem') return 'redemption';
  if (action === 'reward.contribute') return 'contribution';
  if (action === 'reward.return' || action === 'reward.remove') return 'contribution-return';
  return 'spending-adjustment';
}

function spentKids(state, currency) {
  if (!state) return {};
  if (currency === 'star') return state.spent || {};
  if (currency === 'gold') return state.goldSpent || {};
  return (state.currencySpent || {})[currency] || {};
}
