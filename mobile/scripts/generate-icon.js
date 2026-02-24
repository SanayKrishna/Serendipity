/**
 * Generates the Serendipity app icon assets (Torii gate design)
 * Run from the mobile/ directory:  node scripts/generate-icon.js
 *
 * Requires:  npm install sharp  (one-time, in mobile/)
 */
const sharp = require('sharp');
const path  = require('path');

// ─── SVG drawing of the Torii gate ─────────────────────────────────────────────
// All coordinates are on a 1024×1024 canvas.
// Vermillion gate on a warm cream background — classic Japanese aesthetic.
const toriiSvg = (size) => {
  const s = size / 1024; // scale factor
  return `
<svg width="${size}" height="${size}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="65%">
      <stop offset="0%"   stop-color="#FFFCF5"/>
      <stop offset="100%" stop-color="#FFE5C0"/>
    </radialGradient>
  </defs>

  <!-- Background (rounded square, safe for iOS icon mask) -->
  <rect width="1024" height="1024" fill="url(#bg)"/>

  <!-- ── Torii gate – vermillion (#C8401E) ────────────────────────────── -->

  <!-- Kasagi – top curved crossbar (trapezoid giving the illusion of curve) -->
  <polygon
    points="110,330  914,330  880,265  144,265"
    fill="#C8401E"/>

  <!-- Shimaki – cap on top of kasagi -->
  <rect x="144" y="235" width="736" height="35" rx="6" fill="#B53418"/>

  <!-- Nuki – second horizontal beam -->
  <rect x="238" y="442" width="548" height="52" rx="5" fill="#C8401E"/>

  <!-- Left pillar  (extends from nuki down through kasagi) -->
  <rect x="238" y="265" width="88" height="530" rx="8" fill="#C8401E"/>

  <!-- Right pillar -->
  <rect x="698" y="265" width="88" height="530" rx="8" fill="#C8401E"/>

  <!-- Pillar feet / shimizu (slight widow flare at base) -->
  <rect x="224" y="766" width="116" height="28" rx="6" fill="#B53418"/>
  <rect x="684" y="766" width="116" height="28" rx="6" fill="#B53418"/>

  <!-- ── Sakura blossom (5 petals, bottom-right accent) ──────────────── -->
  <!-- petal helper: 5 ellipses rotated around centre (740,745) -->
  <g transform="translate(730,745)">
    <ellipse cx="0" cy="-28" rx="14" ry="22" fill="#F48FB1" opacity="0.92" transform="rotate(0)"/>
    <ellipse cx="0" cy="-28" rx="14" ry="22" fill="#F48FB1" opacity="0.92" transform="rotate(72)"/>
    <ellipse cx="0" cy="-28" rx="14" ry="22" fill="#F48FB1" opacity="0.92" transform="rotate(144)"/>
    <ellipse cx="0" cy="-28" rx="14" ry="22" fill="#F48FB1" opacity="0.92" transform="rotate(216)"/>
    <ellipse cx="0" cy="-28" rx="14" ry="22" fill="#F48FB1" opacity="0.92" transform="rotate(288)"/>
    <circle  cx="0" cy="0"   r="10"           fill="#F8BBD0"/>
    <!-- stamen dots -->
    <circle cx="0"  cy="-14" r="2.5" fill="#AD1457"/>
    <circle cx="13" cy="-4"  r="2.5" fill="#AD1457"/>
    <circle cx="8"  cy="12"  r="2.5" fill="#AD1457"/>
    <circle cx="-8" cy="12"  r="2.5" fill="#AD1457"/>
    <circle cx="-13" cy="-4" r="2.5" fill="#AD1457"/>
  </g>

  <!-- Smaller scattered sakura top-left -->
  <g transform="translate(290,210) scale(0.55)">
    <ellipse cx="0" cy="-28" rx="14" ry="22" fill="#F48FB1" opacity="0.75" transform="rotate(0)"/>
    <ellipse cx="0" cy="-28" rx="14" ry="22" fill="#F48FB1" opacity="0.75" transform="rotate(72)"/>
    <ellipse cx="0" cy="-28" rx="14" ry="22" fill="#F48FB1" opacity="0.75" transform="rotate(144)"/>
    <ellipse cx="0" cy="-28" rx="14" ry="22" fill="#F48FB1" opacity="0.75" transform="rotate(216)"/>
    <ellipse cx="0" cy="-28" rx="14" ry="22" fill="#F48FB1" opacity="0.75" transform="rotate(288)"/>
    <circle  cx="0" cy="0"  r="10" fill="#F8BBD0" opacity="0.75"/>
  </g>
</svg>`;
};

// ─── Generate each asset ────────────────────────────────────────────────────────
const assets = path.resolve(__dirname, '../assets');

async function make(svgStr, outFile, size) {
  await sharp(Buffer.from(svgStr))
    .resize(size, size)
    .png()
    .toFile(outFile);
  console.log(`✅  ${path.basename(outFile)}  (${size}×${size})`);
}

(async () => {
  try {
    // icon.png — 1024×1024, used for iOS App Store + general icon
    await make(toriiSvg(1024), path.join(assets, 'icon.png'), 1024);

    // adaptive-icon.png — 1024×1024, Android adaptive icon foreground
    // Android crops to a circle/squircle so put the gate more centred
    await make(toriiSvg(1024), path.join(assets, 'adaptive-icon.png'), 1024);

    // splash-icon.png — shown on the splash screen (200×200 recommended)
    await make(toriiSvg(512),  path.join(assets, 'splash-icon.png'), 512);

    // favicon.png — web
    await make(toriiSvg(48),   path.join(assets, 'favicon.png'), 48);

    console.log('\n🎉  All icon assets generated successfully!');
    console.log('    Rebuild the app with EAS to see the new launcher icon.');
  } catch (err) {
    console.error('❌  Error generating icons:', err.message);
    console.error('    Make sure sharp is installed:  npm install sharp');
  }
})();
