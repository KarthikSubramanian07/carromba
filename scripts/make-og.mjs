// Renders the social share image (public/og-image.png) from an inline SVG.
// Run with `npm run og`. It is a one-time asset build, not part of the site
// bundle, so sharp stays a dev-only dependency.

import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'og-image.png');

// A small carrom board illustration, drawn the same way the favicon is, sitting
// beside the wordmark. Warm Heritage palette so the card matches the default look.
function board(cx, cy, size) {
  const s = size;
  const inset = s * 0.12;
  const play = s - inset * 2;
  const pr = s * 0.075;
  const corners = [
    [cx - s / 2, cy - s / 2],
    [cx + s / 2, cy - s / 2],
    [cx - s / 2, cy + s / 2],
    [cx + s / 2, cy + s / 2],
  ];
  const men = [];
  const ring = s * 0.11;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    men.push([cx + Math.cos(a) * ring, cy + Math.sin(a) * ring, i % 2 === 0 ? '#f2e6cf' : '#26221d']);
  }
  return `
    <rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="${s * 0.06}" fill="url(#wood)"/>
    <rect x="${cx - s / 2 + inset}" y="${cy - s / 2 + inset}" width="${play}" height="${play}" rx="${s * 0.03}" fill="url(#felt)"/>
    ${corners.map(([x, y]) => `<circle cx="${x + Math.sign(cx - x) * inset * 0.9 + (x < cx ? inset * 0.1 : -inset * 0.1)}" cy="${y + Math.sign(cy - y) * inset * 0.9}" r="${pr}" fill="#241610"/>`).join('')}
    <circle cx="${cx}" cy="${cy}" r="${s * 0.19}" fill="none" stroke="#9c5a3c" stroke-width="${s * 0.006}"/>
    ${men.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="${s * 0.045}" fill="${c}" stroke="#b79b6f" stroke-width="1"/>`).join('')}
    <circle cx="${cx}" cy="${cy}" r="${s * 0.05}" fill="#b0202f" stroke="#6d1019" stroke-width="1.5"/>
    <circle cx="${cx - s * 0.02}" cy="${cy + s * 0.34}" r="${s * 0.06}" fill="#e8c68a" stroke="#a9803f" stroke-width="1.5"/>
  `;
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="0.35" cy="0.1" r="1.1">
      <stop offset="0" stop-color="#3a2b1e"/>
      <stop offset="0.7" stop-color="#2a1f16"/>
    </radialGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9c6c40"/>
      <stop offset="1" stop-color="#5a381d"/>
    </linearGradient>
    <radialGradient id="felt" cx="0.5" cy="0.45" r="0.7">
      <stop offset="0" stop-color="#f0e2c0"/>
      <stop offset="1" stop-color="#e6d3a8"/>
    </radialGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3e7d2"/>
      <stop offset="1" stop-color="#d99a6c"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  ${board(910, 315, 400)}
  <text x="90" y="250" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="104" font-weight="800" letter-spacing="8" fill="url(#ink)">CARROMBA</text>
  <text x="94" y="320" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="38" font-weight="600" fill="#e6d3a8">Play carrom online. Free, no ads.</text>
  <text x="94" y="372" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="30" fill="#b8a488">Physics-driven. Vs the computer or pass-and-play.</text>
  <text x="94" y="560" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="26" font-weight="600" fill="#c8622f">carromba.pages.dev</text>
</svg>`;

writeFileSync(join(here, '..', 'public', 'og-image.svg'), svg.trim());
await sharp(Buffer.from(svg)).png().toFile(out);
console.log('Wrote', out);
