function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year, month, weekday) {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function seasonOf(date = new Date()) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

export function holidayOf(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  if (month === 0 && day === 1) return "new-year";
  if (month === 1 && day === 14) return "valentine";
  if (month === 2 && day === 17) return "st-patrick";
  if (month === 4 && sameDay(date, lastWeekday(year, 4, 1))) return "memorial";
  if (month === 5 && day === 19) return "juneteenth";
  if (month === 6 && day === 4) return "independence";
  if (month === 8 && sameDay(date, nthWeekday(year, 8, 1, 1))) return "labor";
  if (month === 9 && day === 31) return "halloween";
  if (month === 10 && day === 11) return "veterans";
  if (month === 10 && sameDay(date, nthWeekday(year, 10, 4, 4))) return "thanksgiving";
  if (month === 11 && day === 25) return "christmas-day";
  if (month === 11 && day === 31) return "new-year";
  if (month === 11 && day >= 1) return "christmas";
  return "";
}

export function holidayMoment(date = new Date()) {
  return { season: seasonOf(date), holiday: holidayOf(date) };
}

const HOLIDAY_GREETINGS = {
  veterans: "Happy Veterans Day",
  thanksgiving: "Happy Thanksgiving",
  halloween: "Happy Halloween",
  christmas: "Merry Christmas",
  "christmas-day": "Merry Christmas",
  "new-year": "Happy New Year",
  valentine: "Happy Valentine's Day",
  "st-patrick": "Happy St. Patrick's Day",
  memorial: "Happy Memorial Day",
  juneteenth: "Happy Juneteenth",
  independence: "Happy Independence Day",
  labor: "Happy Labor Day",
};

export function holidayGreeting(date = new Date()) {
  return HOLIDAY_GREETINGS[holidayOf(date)] || "";
}
