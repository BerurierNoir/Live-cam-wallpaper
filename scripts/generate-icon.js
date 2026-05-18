#!/usr/bin/env node
/**
 * Génère assets/icon.png (512x512) depuis assets/icon.svg
 * Utilise sharp si disponible, sinon ImageMagick
 */
const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const root    = path.join(__dirname, '..');
const svgPath = path.join(root, 'assets', 'icon.svg');
const pngPath = path.join(root, 'assets', 'icon.png');

if (!fs.existsSync(svgPath)) {
  console.error('icon.svg introuvable');
  process.exit(1);
}

// Essayer ImageMagick
const tools = [
  `convert -background none -resize 512x512 "${svgPath}" "${pngPath}"`,
  `rsvg-convert -w 512 -h 512 "${svgPath}" -o "${pngPath}"`,
  `inkscape --export-png="${pngPath}" --export-width=512 "${svgPath}"`,
];

let success = false;
for (const cmd of tools) {
  try {
    execSync(cmd, { stdio: 'pipe' });
    success = true;
    console.log(`✓ icon.png généré avec: ${cmd.split(' ')[0]}`);
    break;
  } catch (_) {}
}

if (!success) {
  console.warn('⚠ Impossible de convertir SVG→PNG (install ImageMagick: sudo dnf install ImageMagick)');
  console.warn('  L\'icône par défaut sera utilisée pour le build');
}
