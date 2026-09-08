import { todayKey } from "./dates.js";

export const DEFAULT_SAYINGS = [
  "Stars well earned are stars well spent.",
  "A tidy room is a treasure chest.",
  "Kindness is always in stock.",
  "Today's special: helping without being asked.",
  "Save a few stars. Splurge on a few more.",
  "The best deals are the chores you finish.",
  "Little jobs add up to big adventures.",
  "I keep the shop. You keep the sparkle.",
  "Come back after one more chore. I'll wait.",
  "A thank-you is worth a pocket of stars.",
  "Fresh socks, fresh start, fair prices.",
  "The early helper gets the good stuff.",
  "Share the work, share the treats.",
  "I like customers who make their bed.",
  "Put the toys away and the shop stays open.",
  "One chore, one step closer to the prize.",
  "Polite words cost nothing and buy everything.",
  "Your stars are safe here. Your mess is not.",
  "Homework first, then we talk snacks.",
  "A clean plate is a kind of treasure too.",
  "Teamwork is my favorite currency.",
  "The shop never runs out of second chances.",
  "Brave kids finish the hard chore first.",
  "I packed extra smiles with the inventory.",
  "Help a sibling, earn a legend.",
  "Dust bunnies do not spend stars. You do.",
  "Today is a good day to surprise a parent.",
  "Quiet helpers are my favorite regulars.",
  "Fold the laundry. Unfold the fun later.",
  "The door is open. The chores are waiting.",
  "Take pride with you. Leave crumbs behind.",
  "A little hustle looks good on you.",
  "I saved a bargain for whoever finishes next.",
  "Stars shine brighter after a finished list.",
  "Be kind at the table and in the shop.",
  "The best customers come back after they help.",
  "Rainy day, indoor chores, cozy rewards.",
  "You cannot buy tomorrow's stars today. Earn them.",
  "I believe in you more than in my cash box.",
  "Finish strong, then come spend a little joy.",
];

export function parseSayingsText(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function formatSayingsText(list) {
  return (Array.isArray(list) ? list : DEFAULT_SAYINGS)
    .map((line) => String(line).trim())
    .filter(Boolean)
    .join("\n");
}

export function householdSayings(list) {
  if (!Array.isArray(list)) return DEFAULT_SAYINGS.slice();
  return list.map((line) => String(line).trim()).filter(Boolean);
}

function indexForDay(day) {
  let n = 2166136261;
  for (let i = 0; i < day.length; i++) {
    n ^= day.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}

export function sayingForDay(day = todayKey(), list) {
  const sayings = householdSayings(list);
  if (!sayings.length) return "";
  return sayings[indexForDay(String(day || todayKey())) % sayings.length];
}
