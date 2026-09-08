import { atom } from "nanostores";

export const VIEW_KEY = "chore-fridge-view";
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 150;
export const ZOOM_STEP = 10;

export const APPEARANCES = {
  light: true,
  dark: true,
  system: true,
};

export const LOOKS = {
  modern: true,
  classic: true,
  business: true,
  crayon: true,
  contrast: true,
  lego: true,
  cyberpunk: true,
};

export const LAYOUTS = {
  classic: true,
  gallery: true,
  slide: true,
};

const STATE_KEY = "chore-fridge-v2";
const ZOOM_OK =
  typeof document !== "undefined" && "zoom" in document.documentElement.style;

const THEME_COLORS = {
  modern: { light: "#f3f6f8", dark: "#101b23" },
  classic: { light: "#cfd8de", dark: "#2b3338" },
  business: { light: "#d5dee8", dark: "#1a2330" },
  crayon: { light: "#f2d48a", dark: "#3a2412" },
  contrast: { light: "#ffffff", dark: "#000000" },
  lego: { light: "#f5cd2f", dark: "#1a1a1a" },
  cyberpunk: { light: "#c8b8e8", dark: "#0b0714" },
};

export const $view = atom(null);
let watching = false;

function clampZoom(n) {
  n = Math.round(Number(n) / ZOOM_STEP) * ZOOM_STEP;
  if (!Number.isFinite(n)) n = 100;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

function appearanceFromNightMode(mode) {
  if (mode === "on") return "dark";
  if (mode === "off") return "light";
  return "system";
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function defaultAppearance() {
  const state = readJson(STATE_KEY);
  return appearanceFromNightMode(state && state.nightMode);
}

export function getView() {
  if ($view.get()) return $view.get();
  const stored = readJson(VIEW_KEY);
  const appearance =
    stored && APPEARANCES[stored.appearance]
      ? stored.appearance
      : stored && APPEARANCES[stored.theme]
        ? stored.theme
        : defaultAppearance();
  const prefs = {
    modernColor: /^#[0-9a-f]{6}$/i.test(stored?.modernColor || "") ? stored.modernColor : "#146879",
    appearance,
    look: stored && LOOKS[stored.look] ? stored.look : "classic",
    layout: stored && LAYOUTS[stored.layout] ? stored.layout : "classic",
    zoom: stored && stored.zoom != null ? clampZoom(stored.zoom) : 100,
  };
  $view.set(prefs);
  return prefs;
}

function save() {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(getView()));
  } catch {}
}

export function isDark() {
  const appearance = getView().appearance;
  if (appearance === "dark") return true;
  if (appearance === "light") return false;
  if (window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  const hour = new Date().getHours();
  return hour >= 20 || hour < 6;
}

export function applyTheme() {
  const view = getView();
  const on = isDark();
  const look = LOOKS[view.look] ? view.look : "classic";
  const html = document.documentElement;
  html.classList.toggle("night", on);
  html.setAttribute("data-look", look);
  html.setAttribute("data-layout", LAYOUTS[view.layout] ? view.layout : "classic");
  writePalette(html, "modern", view.modernColor || "#146879", on);
  if (document.body) {
    document.body.classList.toggle("night", on);
    document.body.setAttribute("data-look", look);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const colors = THEME_COLORS[look] || THEME_COLORS.classic;
    meta.setAttribute("content", on ? colors.dark : colors.light);
  }
}

export function paletteFromHex(hex, dark) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) hex = "#146879";
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
  const lit = (high + low) / 2;
  const sat = !delta ? 0 : delta / (1 - Math.abs(2 * lit - 1));
  const hue = !delta ? 0 : high === r ? ((g - b) / delta + 6) % 6 : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  const accentLit = dark ? Math.min(0.84, Math.max(0.52, 1 - lit)) : Math.min(0.52, Math.max(0.14, lit));
  return {
    hue: String(Math.round(hue * 60)),
    surfaceSat: Math.round(sat * 40) + "%",
    accentSat: Math.round(sat * 100) + "%",
    accentLit: Math.round(accentLit * 100) + "%",
    onAccent: accentLit > 0.45 ? "#142028" : "#ffffff",
  };
}

export function writePalette(el, prefix, hex, dark) {
  const t = paletteFromHex(hex, dark);
  el.style.setProperty("--" + prefix + "-hue", t.hue);
  el.style.setProperty("--" + prefix + "-surface-sat", t.surfaceSat);
  el.style.setProperty("--" + prefix + "-accent-sat", t.accentSat);
  el.style.setProperty("--" + prefix + "-accent-lit", t.accentLit);
  el.style.setProperty("--" + prefix + "-on-accent", t.onAccent);
}

function clearFallbackZoom(body) {
  body.style.transform = "";
  body.style.transformOrigin = "";
  body.style.width = "";
  body.style.height = "";
}

export function applyZoom() {
  const scale = getView().zoom / 100;
  const html = document.documentElement;
  const body = document.body;
  if (ZOOM_OK) {
    html.style.zoom = String(scale);
    if (body) clearFallbackZoom(body);
    return;
  }
  html.style.zoom = "";
  if (!body) return;
  if (scale === 1) {
    clearFallbackZoom(body);
    return;
  }
  body.style.transformOrigin = "top left";
  body.style.transform = "scale(" + scale + ")";
  body.style.width = 100 / scale + "%";
  body.style.height = 100 / scale + "%";
}

export function applyView() {
  applyTheme();
  applyZoom();
}

export function setTheme(theme) {
  $view.set({ ...getView(), appearance: APPEARANCES[theme] ? theme : "system" });
  save();
  applyTheme();
}

export function setLook(look) {
  $view.set({ ...getView(), look: LOOKS[look] ? look : "classic" });
  save();
  applyTheme();
}

export function setModernColor(modernColor) {
  if (!/^#[0-9a-f]{6}$/i.test(modernColor)) return;
  $view.set({...getView(), modernColor});
  save();
  applyTheme();
}

export function setZoom(zoom) {
  $view.set({ ...getView(), zoom: clampZoom(zoom) });
  save();
  applyZoom();
}

export function setLayout(layout) {
  $view.set({ ...getView(), layout: LAYOUTS[layout] ? layout : "classic" });
  save();
  applyTheme();
}

export function watchView() {
  if (watching) return;
  watching = true;
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme();
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== VIEW_KEY) return;
    $view.set(null);
    applyView();
  });
}
