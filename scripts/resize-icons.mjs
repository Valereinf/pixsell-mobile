import sharp from 'sharp'
import { renameSync, existsSync, copyFileSync } from 'fs'

const CANVAS = 1024
const LOGO_SIZE = 410               // 40% de 1024
const PAD = Math.floor((CANVAS - LOGO_SIZE) / 2)  // 307px de chaque côté

// Source originale — jamais écrasée par ce script
const SOURCE = 'assets/icon-original.png'

if (!existsSync(SOURCE)) {
  copyFileSync('assets/icon.png', SOURCE)
  console.log(`${SOURCE} créé comme sauvegarde source ✓`)
}

async function processIcon(dest) {
  const resized = await sharp(SOURCE)
    .resize(LOGO_SIZE, LOGO_SIZE, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toBuffer()

  await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
  })
    .png()
    .composite([{ input: resized, top: PAD, left: PAD }])
    .toFile(dest + '.tmp')

  renameSync(dest + '.tmp', dest)
  const meta = await sharp(dest).metadata()
  console.log(`${dest} → ${meta.width}x${meta.height} ✓  (logo ${LOGO_SIZE}px, marge ${PAD}px de chaque côté)`)
}

await Promise.all([
  processIcon('assets/icon.png'),
  processIcon('assets/adaptive-icon.png'),
])
