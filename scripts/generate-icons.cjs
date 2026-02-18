/**
 * Generate PWA icons from butterfly.svg
 *
 * Run: npm install sharp && node scripts/generate-icons.js
 *
 * Or manually create these icons:
 * - public/icons/icon-192.png (192x192)
 * - public/icons/icon-512.png (512x512)
 * - public/icons/apple-touch-icon.png (180x180)
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.log('Sharp not installed. Install with: npm install sharp --save-dev');
    console.log('Or manually create icon PNGs from public/butterfly.svg');
    console.log('\nRequired icons:');
    console.log('  - public/icons/icon-192.png (192x192)');
    console.log('  - public/icons/icon-512.png (512x512)');
    console.log('  - public/icons/apple-touch-icon.png (180x180)');
    return;
  }

  const svgPath = path.join(__dirname, '..', 'public', 'butterfly.svg');
  const iconsDir = path.join(__dirname, '..', 'public', 'icons');

  // Ensure icons directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const svgBuffer = fs.readFileSync(svgPath);

  // Generate icons with solid background for better visibility
  const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  for (const { name, size } of sizes) {
    const outputPath = path.join(iconsDir, name);

    // Create a dark background with the butterfly centered
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 10, g: 10, b: 15, alpha: 1 } // #0a0a0f
      }
    })
    .composite([{
      input: await sharp(svgBuffer)
        .resize(Math.round(size * 0.8), Math.round(size * 0.8))
        .toBuffer(),
      gravity: 'center'
    }])
    .png()
    .toFile(outputPath);

    console.log(`Generated: ${name}`);
  }

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
