export function mergeCompletions(a, b) {
  const out = Object.assign({}, a || {});
  const other = b || {};
  for (const key of Object.keys(other)) {
    const incoming = Number(other[key]) || 0;
    const current = Number(out[key]) || 0;
    if (!out[key] || Math.abs(incoming) >= Math.abs(current)) out[key] = incoming;
  }
  return out;
}

export function countRec(v) {
  if (v && typeof v === "object") {
    return { n: Math.max(0, Number(v.n) || 0), t: Number(v.t) || 0 };
  }
  const n = Number(v) || 0;
  return { n: Math.max(0, n), t: 0 };
}

export function mergeCounts(a, b) {
  const out = Object.assign({}, a || {});
  const other = b || {};
  for (const key of Object.keys(other)) {
    const incoming = countRec(other[key]);
    const current = out[key] ? countRec(out[key]) : null;
    if (!current || incoming.t >= current.t) out[key] = incoming;
  }
  return out;
}

