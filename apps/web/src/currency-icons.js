const SVG = "http://www.w3.org/2000/svg";
let shine = 0;

function node(name, attrs = {}) {
  const el = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function icon(className, children) {
  const svg = node("svg", {
    viewBox: "0 0 24 24",
    class: "currency-icon" + (className ? " " + className : ""),
    "aria-hidden": "true",
    focusable: "false",
  });
  for (const child of children) svg.append(child);
  return svg;
}

const STAR = "M12 2.4l2.7 6.3 6.8.7-5.1 4.7 1.5 6.7L12 17.5 6.1 20.8l1.5-6.7-5.1-4.7 6.8-.7z";

export function starIcon() {
  return icon("star", [node("path", { d: STAR })]);
}

export function goldStarIcon() {
  const id = "gold-shine-" + (++shine);
  const gradient = node("linearGradient", { id, x1: "-1", y1: "0", x2: "0", y2: "0" });
  gradient.append(
    node("stop", { offset: "0", "stop-color": "var(--gold)" }),
    node("stop", { offset: "0.42", "stop-color": "var(--gold)" }),
    node("stop", { offset: "0.5", "stop-color": "#fff8dc" }),
    node("stop", { offset: "0.58", "stop-color": "var(--gold)" }),
    node("stop", { offset: "1", "stop-color": "var(--gold)" }),
    node("animate", { attributeName: "x1", values: "-1;1", dur: "2.2s", repeatCount: "indefinite" }),
    node("animate", { attributeName: "x2", values: "0;2", dur: "2.2s", repeatCount: "indefinite" }),
  );
  const defs = node("defs");
  defs.append(gradient);
  return icon("gold", [defs, node("path", { d: STAR, fill: "url(#" + id + ")" })]);
}

export function coinIcon() {
  return icon("coin", [
    node("circle", { cx: "12", cy: "12", r: "9.2" }),
    node("circle", { cx: "12", cy: "12", r: "6.2", fill: "none", stroke: "currentColor", "stroke-width": "1.4", opacity: "0.35" }),
  ]);
}

export function dollarIcon() {
  return icon("dollar", [
    node("circle", { cx: "12", cy: "12", r: "9.2" }),
    node("path", {
      class: "cutout",
      d: "M12.7 6.5v1c1.3.2 2.2 1 2.2 2.3 0 1.4-1.1 2.1-2.9 2.4v3.2c.6-.1 1.1-.4 1.4-.8.2-.3.6-.4.9-.2l.3.2c.3.2.4.6.2.9-.6.9-1.6 1.5-2.8 1.7v1h-1.4v-1c-1.4-.2-2.4-1.1-2.4-2.6 0-1.5 1.1-2.2 2.9-2.5V9.3c-.6.1-1 .4-1.3.8-.2.3-.6.4-.9.2l-.3-.2c-.3-.2-.4-.6-.2-.9.5-.8 1.5-1.4 2.7-1.6v-1h1.4zm-2.3 8.4c0 .5.4.9 1.3 1v-2c-.9.2-1.3.5-1.3 1zm2.3-4.8c0-.5-.4-.8-1.2-1v1.9c.8-.1 1.2-.4 1.2-.9z",
    }),
  ]);
}

export function hoursIcon() {
  return icon("hours", [
    node("circle", { cx: "12", cy: "12", r: "9.2", fill: "none", "stroke-width": "1.8" }),
    node("path", { d: "M12 6.2c.5 0 .9.4.9.9v5.1l3.2 1.9c.4.2.5.8.3 1.2-.2.4-.8.5-1.2.3l-3.7-2.2c-.3-.2-.5-.5-.5-.8V7.1c0-.5.4-.9.9-.9z" }),
  ]);
}

export function currencyIcon(id) {
  if (id === "gold") return goldStarIcon();
  if (id === "coin") return coinIcon();
  if (id === "dollar") return dollarIcon();
  if (id === "hours") return hoursIcon();
  return starIcon();
}
