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
  classic: true,
  business: true,
  crayon: true,
  contrast: true,
  lego: true,
  cyberpunk: true,
};

const STATE_KEY = "chore-fridge-v2";
const ZOOM_OK =
  typeof document !== "undefined" && "zoom" in document.documentElement.style;

const THEME_COLORS = {
  classic: { light: "#cfd8de", dark: "#2b3338" },
  business: { light: "#d5dee8", dark: "#1a2330" },
  crayon: { light: "#f2d48a", dark: "#3a2412" },
  contrast: { light: "#ffffff", dark: "#000000" },
  lego: { light: "#f5cd2f", dark: "#1a1a1a" },
  cyberpunk: { light: "#c8b8e8", dark: "#0b0714" },
};

let prefs = null;
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
  if (prefs) return prefs;
  const stored = readJson(VIEW_KEY);
  const appearance =
    stored && APPEARANCES[stored.appearance]
      ? stored.appearance
      : stored && APPEARANCES[stored.theme]
        ? stored.theme
        : defaultAppearance();
  prefs = {
    appearance,
    look: stored && LOOKS[stored.look] ? stored.look : "classic",
    zoom: stored && stored.zoom != null ? clampZoom(stored.zoom) : 100,
  };
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
  window.dispatchEvent(new Event("fridge-view-change"));
}

export function setTheme(theme) {
  getView().appearance = APPEARANCES[theme] ? theme : "system";
  save();
  applyTheme();
  window.dispatchEvent(new Event("fridge-view-change"));
}

export function setLook(look) {
  getView().look = LOOKS[look] ? look : "classic";
  save();
  applyTheme();
  window.dispatchEvent(new Event("fridge-view-change"));
}

export function setZoom(zoom) {
  getView().zoom = clampZoom(zoom);
  save();
  applyZoom();
  window.dispatchEvent(new Event("fridge-view-change"));
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
    prefs = null;
    applyView();
  });
}
