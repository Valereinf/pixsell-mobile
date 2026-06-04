import sharp from 'sharp'
import { renameSync } from 'fs'

const CANVAS = 1024
const LOGO_SIZE = Math.round(CANVAS * 0.60) // 614px
const PAD = Math.floor((CANVAS - LOGO_SIZE) / 2)

async function processIcon(src) {
  const resized = await sharp(src)
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
    .toFile(src + '.tmp')

  renameSync(src + '.tmp', src)
  const meta = await sharp(src).metadata()
  console.log(`${src} → ${meta.width}x${meta.height} ✓`)
}

await Promise.all([
  processIcon('assets/icon.png'),
  processIcon('assets/adaptive-icon.png'),
])
