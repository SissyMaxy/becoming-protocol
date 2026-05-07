#!/usr/bin/env node
// Generate stealth-mode alternate icon PNGs (calculator + notes) from
// inline SVG sources. Idempotent — re-running produces byte-identical
// output for the same SVG input.
//
// Usage: node scripts/stealth/generate-icons.mjs
//
// Outputs to public/icons/:
//   - calculator-192.png, calculator-512.png
//   - notes-192.png, notes-512.png

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_ICONS = resolve(__dirname, '..', '..', 'public', 'icons');

mkdirSync(PUBLIC_ICONS, { recursive: true });

// Calculator: dark grey field, four button-grid, "=" highlight.
const calculatorSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1f2937"/>
  <rect x="64" y="64" width="384" height="96" rx="16" fill="#0f172a"/>
  <text x="424" y="132" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="500" fill="#f8fafc" text-anchor="end">0</text>
  <g fill="#374151">
    <rect x="64"  y="200" width="80" height="64" rx="12"/>
    <rect x="160" y="200" width="80" height="64" rx="12"/>
    <rect x="256" y="200" width="80" height="64" rx="12"/>
    <rect x="64"  y="280" width="80" height="64" rx="12"/>
    <rect x="160" y="280" width="80" height="64" rx="12"/>
    <rect x="256" y="280" width="80" height="64" rx="12"/>
    <rect x="64"  y="360" width="80" height="64" rx="12"/>
    <rect x="160" y="360" width="80" height="64" rx="12"/>
    <rect x="256" y="360" width="80" height="64" rx="12"/>
  </g>
  <g fill="#f97316">
    <rect x="352" y="200" width="80" height="64" rx="12"/>
    <rect x="352" y="280" width="80" height="64" rx="12"/>
    <rect x="352" y="360" width="80" height="144" rx="12"/>
  </g>
  <rect x="64" y="440" width="272" height="64" rx="12" fill="#374151"/>
</svg>`;

// Notes: cream paper, three ruled lines, top folded corner.
const notesSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#fef3c7"/>
  <rect x="56" y="56" width="400" height="400" rx="32" fill="#fffbeb"/>
  <path d="M 360 56 L 456 56 L 456 152 Z" fill="#facc15" opacity="0.4"/>
  <path d="M 360 56 L 456 152 L 360 152 Z" fill="#fcd34d"/>
  <g stroke="#d97706" stroke-width="6" stroke-linecap="round" opacity="0.6">
    <line x1="104" y1="200" x2="408" y2="200"/>
    <line x1="104" y1="260" x2="360" y2="260"/>
    <line x1="104" y1="320" x2="392" y2="320"/>
    <line x1="104" y1="380" x2="288" y2="380"/>
  </g>
</svg>`;

async function emit(svg, name) {
  const buf = Buffer.from(svg);
  await sharp(buf).resize(192, 192).png({ compressionLevel: 9 }).toFile(`${PUBLIC_ICONS}/${name}-192.png`);
  await sharp(buf).resize(512, 512).png({ compressionLevel: 9 }).toFile(`${PUBLIC_ICONS}/${name}-512.png`);
  console.log(`generated ${name}-192.png + ${name}-512.png`);
}

await emit(calculatorSvg, 'calculator');
await emit(notesSvg, 'notes');
