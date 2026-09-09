import { $pin, $setupDone } from "./family.js";
import { map } from "nanostores";

export const $ui = map({
  view: "board",
  parentUnlocked: false,
  parentTab: "general",
  pinBuf: "",
  pinMode: "enter",
});


export function setUI(patch) { $ui.set({ ...$ui.get(), ...patch }); }

export function openParent() {
  if ($ui.get().parentUnlocked) return;
  if ($pin.get()) setUI({pinMode:"enter",pinBuf:"",view:"pin"});
  else unlockParent();
}

export function unlockParent() {
  setUI({parentUnlocked:true,pinBuf:"",view:"board"});
}

export function lockParent() {
  setUI({parentUnlocked:false,pinBuf:"",pinMode:"enter",view:"board"});
}

// Local to this page session, never persisted or synchronized between devices.
$pin.listen(() => lockParent());

$setupDone.listen(done => { if (!done) lockParent(); });

export function openSettings() {
  if ($ui.get().parentUnlocked) setUI({view:"parent"});
}

export function closeSettings() {
  if ($ui.get().view === "parent") setUI({view:"board"});
}
