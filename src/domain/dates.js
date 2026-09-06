function pad(n) {
  return (n < 10 ? "0" : "") + n;
}

export function todayKey(d = new Date()) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function datesInWeek(d = new Date()) {
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = mon.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  mon.setDate(mon.getDate() + diff);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    out.push(todayKey(x));
  }
  return out;
}

export function prettyDate() {
  try {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return todayKey();
  }
}

