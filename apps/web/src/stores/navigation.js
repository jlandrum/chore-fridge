import { map } from "nanostores";

export const $ui = map({
  view: "board",
  parentTab: "kids",
  pinBuf: "",
  pinMode: "enter",
});


export function setUI(patch) { $ui.set({ ...$ui.get(), ...patch }); }
