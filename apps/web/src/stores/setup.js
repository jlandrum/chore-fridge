import { map, batch } from "nanostores";
import { commit } from "./changes.js";
import { $familyName, $kids, $pin, $setupDone } from "./family.js";
import { $chores } from "./chores.js";
import { $rewards } from "./rewards.js";
import { setUI } from "./navigation.js";
import { resetHousehold } from "./sync.js";

export const $setup = map({ step: 0, familyName: "Our Family", kids: [] });
export function setSetup(patch) { $setup.set({ ...$setup.get(), ...patch }); }

export function finishSetup(pin) {
  const setup = $setup.get();
  pin = String(pin || "").replace(/\D/g, "").slice(0, 4);
  if (pin.length && pin.length !== 4) return { error: "PIN needs 4 digits" };
  if (!setup.kids.length) return { error: "Add at least one kid" };
  commit(() => {
    setUI({ view: "board" });
    $familyName.set(setup.familyName || "Our Family");
    $kids.set(setup.kids.map((kid) => ({ ...kid })));
    $chores.set([]);
    $rewards.set([]);
    $pin.set(pin);
    $setupDone.set(true);
  }, { type:"setup.finish", payload:{familyName:setup.familyName || "Our Family",kids:setup.kids,pin} });
  return { ok: true };
}

export function eraseBoard() {
  batch(() => {
    $setup.set({ step: 0, familyName: "Our Family", kids: [] });
    setUI({ view: "board", pinBuf: "" });
    resetHousehold();
  });
}
