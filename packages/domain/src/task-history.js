import { countRec } from './history.js';

// The legacy `id` remains an alias for the permanent taskId on the wire.
const definition = task => Object.fromEntries(Object.entries(task).filter(([key]) => !['taskId','versionId','validFrom','archived','archivedAt'].includes(key)));
const equal = (a,b) => JSON.stringify(definition(a)) === JSON.stringify(definition(b));
function version(task, versionId, at, archived = false) {
  return {...definition(task),taskId:task.id,versionId,validFrom:at,archived};
}
function quantities(state) {
  const result = {};
  for (const key of new Set([...Object.keys(state.completions || {}),...Object.keys(state.counts || {})])) {
    result[key] = Math.max(0,countRec(state.counts?.[key]).n) || (state.completions?.[key] > 0 ? 1 : 0);
  }
  return result;
}
function credit(task,kidId,units) {
  return {taskId:task.id,versionId:task.versionId,kidId,units,points:task.points || 0,gold:!!task.gold};
}

export function initializeTaskHistory(state, at = Date.now()) {
  if (state.historyVersion === 1) return state;
  const chores = state.chores.map(task => version(task,'baseline-'+task.id,at));
  const creditLedger = {};
  for (const [key,units] of Object.entries(quantities(state))) {
    const [,taskId,kidId] = key.split(':');
    const task = chores.find(task => task.id === taskId);
    if (units && task) {
      const known = task.kidIds?.includes(kidId) ? task : {...task,points:0,gold:false};
      creditLedger[key] = [credit(known,kidId,units)];
    }
  }
  return {...state,historyVersion:1,historyStartedAt:at,chores,archivedChores:[],taskVersions:chores.slice(),creditLedger};
}

// Derived current state may change; the recorded versions never do.
export function evolveTaskHistory(previous, next, change, at = Date.now()) {
  const old = initializeTaskHistory(previous,at);
  let versions = old.taskVersions.slice();
  let archived = old.archivedChores.slice();
  const make = (task, removed = false) => {
    const item = version(task,'version-'+change.id+'-'+task.id,at,removed);
    versions.push(item);
    return item;
  };
  const chores = next.chores.map(task => {
    const existing = old.chores.find(item => item.id === task.id);
    if (existing && equal(existing,task)) return existing;
    archived = archived.filter(item => item.id !== task.id);
    return make(task);
  });
  for (const task of old.chores) {
    if (!chores.some(item => item.id === task.id)) archived.push(make(task,true));
  }
  const state = {...next,historyVersion:1,historyStartedAt:old.historyStartedAt,chores,archivedChores:archived,taskVersions:versions};
  state.creditLedger = reconcileCredits(state,old.creditLedger,change.payload?.versionId);
  return state;
}

// Counts can contain units earned under several versions; undo removes the
// latest units first. Editing or archiving a definition never revalues them.
export function reconcileCredits(state, ledger, requestedVersion) {
  const result = {...ledger};
  for (const key of new Set([...Object.keys(quantities(state)),...Object.keys(ledger)])) {
    const [,taskId,kidId] = key.split(':');
    const units = quantitiesForKey(state,key);
    const entries = (ledger[key] || []).map(entry => ({...entry}));
    const total = entries.reduce((sum,entry) => sum + entry.units,0);
    if (units > total) {
      const task = state.taskVersions?.find(item => item.versionId === requestedVersion && item.id === taskId)
        || state.chores.find(item => item.id === taskId)
        || state.archivedChores?.find(item => item.id === taskId);
      if (task) entries.push(credit(task,kidId,units-total));
    } else {
      let remove = total-units;
      while (remove > 0 && entries.length) {
        const entry = entries.at(-1);
        const n = Math.min(remove,entry.units);
        entry.units -= n; remove -= n;
        if (!entry.units) entries.pop();
      }
    }
    if (entries.length) result[key] = entries;
    else delete result[key];
  }
  return result;
}
function quantitiesForKey(state,key) {
  return Math.max(0,countRec(state.counts?.[key]).n) || (state.completions?.[key] > 0 ? 1 : 0);
}
