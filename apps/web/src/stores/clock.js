import { atom } from "nanostores";
import { parseDay, todayKey } from "@chore-fridge/domain/dates";

export const $clock = atom(Date.now());
export const $boardDay = atom(todayKey());

export function tick() {
  $clock.set(Date.now());
  if ($boardDay.get() > todayKey()) $boardDay.set(todayKey());
}

export function boardDate() {
  return parseDay($boardDay.get()) || new Date();
}

export function shiftBoardDay(delta) {
  const today = todayKey();
  const date = parseDay($boardDay.get()) || new Date();
  date.setDate(date.getDate() + delta);
  let next = todayKey(date);
  if (next > today) next = today;
  $boardDay.set(next);
}

export function showTodayBoard() {
  $boardDay.set(todayKey());
}
