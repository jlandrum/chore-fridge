import { atom } from "nanostores";

export const $clock = atom(Date.now());
export function tick() { $clock.set(Date.now()); }
