#!/usr/bin/env node
// Guards the design F rules in the customer app (apps/mobile/src): see AGENTS.md "Design rules (customer app)".
// Fails on the patterns of the September demo that kept coming back:
//   1. pale tinted fills (pale green / pale red-pink) used for choices, states, messages or icon circles;
//   2. a `mint` colour token;
//   3. a choice/state style (`…On`, `…Selected`, `…Active`) or `selected && {…}` with a tinted background;
//   4. text set with a font weight but no brand font (falls back to the system font on phones).
// A deliberate exception carries `ui-check: allow (<reason>)` on the line itself or the line above.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'apps/mobile/src');
const ALLOW = /ui-check: allow/;

/** HSL of a #rgb / #rrggbb colour. */
export function hsl(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (h.length !== 6) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60; if (hue < 0) hue += 360;
  return { h: hue, s, l };
}

/** Pale green or pale red/pink: the demo's state tints. Warm neutrals (ivory, sand, stone) are fine. */
export function isStateTint(hex) {
  const c = hsl(hex);
  if (!c || c.l < 0.82 || c.s < 0.15) return false;
  const green = c.h >= 70 && c.h <= 170;
  const red = c.h <= 15 || c.h >= 330;
  return green || red;
}

export function checkSource(text, file = 'file') {
  const problems = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (ALLOW.test(line) || ALLOW.test(lines[i - 1] ?? '')) return;
    const at = `${file}:${i + 1}`;
    // Only fills are checked (a pale tint as text colour on the green band is fine).
    if (/backgroundColor|\bbg\s*:/.test(line)) for (const m of line.matchAll(/'(#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3})'/g)) {
      if (isStateTint(m[1])) problems.push(`${at}  pale tinted colour ${m[1]}: use a white plate with a coloured edge, a dot or the yellow signal`);
    }
    if (/\bmint\s*:|colors\.mint\b/.test(line)) problems.push(`${at}  the 'mint' token is retired`);
    const state = line.match(/^\s*([A-Za-z]+(?:On|Selected|Active))\s*:\s*\{([^}]*)\}/);
    if (state && /backgroundColor:\s*'#/.test(state[2])) {
      const hex = state[2].match(/backgroundColor:\s*'(#[0-9A-Fa-f]{3,6})'/)?.[1];
      if (hex && isStateTint(hex)) problems.push(`${at}  ${state[1]} fills with a tint: mark the choice with a green edge / radio instead`);
    }
    if (/(selected|checked|chosen)\s*&&\s*\{[^}]*backgroundColor:\s*'#(?!fff\b|FFF\b|FFFFFF\b|ffffff\b)/.test(line)) {
      problems.push(`${at}  selected state with a tinted background`);
    }
    for (const m of line.matchAll(/\{([^{}]*)\}/g)) {
      if (/\bfontWeight\s*:/.test(m[1]) && !/fontFamily\s*:/.test(m[1]) && /\bfontSize\s*:|\bcolor\s*:/.test(m[1])) {
        problems.push(`${at}  text with fontWeight but no fontFamily: use fonts.* (system font otherwise)`);
      }
    }
  });
  return problems;
}

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|ts)$/.test(n) ? [p] : [];
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = files(SRC).flatMap((f) => checkSource(readFileSync(f, 'utf8'), relative(ROOT, f)));
  if (problems.length) {
    console.error(`UI check: ${problems.length} problem(s) — see AGENTS.md "Design rules (customer app)"\n` + problems.join('\n'));
    process.exit(1);
  }
  console.log('UI check: ok');
}
