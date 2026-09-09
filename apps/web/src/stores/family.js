import { atom } from "nanostores";
import { commit } from "./changes.js";
import { uid, upsert } from "@chore-fridge/domain/records";
import { DEFAULT_SAYINGS, parseSayingsText } from "@chore-fridge/domain/sayings";
import { defaultCurrencies, normalizeCurrencies } from "@chore-fridge/domain/currencies";

export const COLORS = ["#e85d4c", "#2a9d8f", "#e9b44c", "#6c63c0", "#4a7c59", "#d9480f"];
export const KID_EMOJIS = ["🐻", "🦁", "🐸", "🦊", "🐼", "🐰", "🦄", "🐲", "🐯", "🐮", "🐙", "⭐"];

export const $requireParentModeForRedemptions = atom(false);
export const $requireParentModeForCompletion = atom(false);
export const $mcpEnabled = atom(false);
export const $familyName = atom("Our Family");
export const $sayings = atom(DEFAULT_SAYINGS.slice());
export const $currencies = atom(defaultCurrencies());
export const $pin = atom("");
export const $setupDone = atom(false);
export const $kids = atom([]);

export function saveKid(kid) {
  const next = { ...kid, id: kid.id || uid() };
  commit(() => $kids.set(upsert($kids.get(), next)), { type:"kid.save", payload:next });
}

export function removeKid(id) {
  commit(() => $kids.set($kids.get().filter((kid) => kid.id !== id)), { type:"kid.remove", payload:{id} });
}

export function setPin(pin) { commit(() => $pin.set(pin), { type:"pin.set", payload:{pin} }); }

export function setFamilyName(familyName) {
  const name = familyName.trim();
  if (!name) return {error:"Enter a household name."};
  commit(() => $familyName.set(name), {type:"settings.update",payload:{familyName:name}});
  return {ok:true};
}

export function setRequireParentModeForCompletion(required) {
  commit(() => $requireParentModeForCompletion.set(required), {type:"settings.update",payload:{requireParentModeForCompletion:required}});
}

export function setRequireParentModeForRedemptions(required) {
  commit(() => $requireParentModeForRedemptions.set(required), {type:"settings.update",payload:{requireParentModeForRedemptions:required}});
}

export function setMcpEnabled(enabled) {
  commit(() => $mcpEnabled.set(enabled), {type:"settings.update",payload:{mcpEnabled:enabled}});
}

export function setSayingsFromText(text) {
  const next = parseSayingsText(text);
  if (next.length > 200) return {error:"Use at most 200 sayings."};
  if (next.some((line) => line.length > 300)) return {error:"Each saying must be 300 characters or fewer."};
  commit(() => $sayings.set(next), {type:"settings.update",payload:{sayings:next}});
  return {ok:true};
}

export function restoreDefaultSayings() {
  const next = DEFAULT_SAYINGS.slice();
  commit(() => $sayings.set(next), {type:"settings.update",payload:{sayings:next}});
}

export function setCurrencies(list) {
  const next = normalizeCurrencies(list);
  commit(() => $currencies.set(next), {type:"settings.update",payload:{currencies:next}});
  return {ok:true};
}
