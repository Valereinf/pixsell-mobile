import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(__dirname, '..', 'assets')
const SRC_BIRD = join(ASSETS, 'android-icon-foreground.png')
const SRC_LOGO = join(ASSETS, 'pixsell_new_logo.png')

// Pixels where max(R,G,B) < threshold become transparent (removes black bg)
async function removeBlackBg(inputPath, threshold = 40) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const buf = Buffer.from(data)
  for (let i = 0; i < buf.length; i += 4) {
    if (Math.max(buf[i], buf[i + 1], buf[i + 2]) < threshold) buf[i + 3] = 0
  }
  return sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer()
}

// All non-transparent pixels → white
async function toWhite(pngBuf) {
  const { data, info } = await sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const buf = Buffer.from(data)
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] > 10) { buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255 }
  }
  return sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer()
}

// Resize fg to fgSize, place centered on a size×size canvas with given bg color
async function placeOnCanvas({ size, bg, fg, fgSize, output }) {
  const { r = 0, g = 0, b = 0, alpha = 0 } = bg ?? {}
  const resized = await sharp(fg)
    .resize(fgSize, fgSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()
  const offset = Math.round((size - fgSize) / 2)
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r, g, b, alpha } },
  })
    .composite([{ input: resized, left: offset, top: offset }])
    .png()
    .toFile(output)
  const name = output.split(/[\\/]/).pop()
  console.log(`✓  ${name}`)
}

async function main() {
  console.log('→ Suppression fond noir : oiseau…')
  const birdNoBg = await removeBlackBg(SRC_BIRD)

  // pixsell_new_logo.png est déjà transparent — pas de removeBlackBg

  console.log('→ Conversion oiseau blanc (monochrome)…')
  const whiteBird = await toWhite(birdNoBg)

  const S = 1024
  const birdPx = Math.round(S * 0.65)   // 666 px
  const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
  const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

  console.log('\n→ Génération des fichiers…\n')

  // a) icon.png — fond blanc, oiseau 65%
  await placeOnCanvas({ size: S, bg: WHITE, fg: birdNoBg, fgSize: birdPx, output: join(ASSETS, 'icon.png') })

  // b) adaptive-icon.png — identique à icon.png
  await placeOnCanvas({ size: S, bg: WHITE, fg: birdNoBg, fgSize: birdPx, output: join(ASSETS, 'adaptive-icon.png') })

  // c) android-icon-foreground.png — fond transparent, oiseau 65%
  await placeOnCanvas({ size: S, bg: CLEAR, fg: birdNoBg, fgSize: birdPx, output: join(ASSETS, 'android-icon-foreground.png') })

  // d) android-icon-background.png — blanc uni 1024×1024
  await sharp({ create: { width: S, height: S, channels: 4, background: WHITE } })
    .png()
    .toFile(join(ASSETS, 'android-icon-background.png'))
  console.log('✓  android-icon-background.png')

  // e) android-icon-monochrome.png — fond transparent, oiseau blanc
  await placeOnCanvas({ size: S, bg: CLEAR, fg: whiteBird, fgSize: birdPx, output: join(ASSETS, 'android-icon-monochrome.png') })

  // f) notification-icon.png — 96×96, fond transparent, oiseau blanc
  await placeOnCanvas({ size: 96, bg: CLEAR, fg: whiteBird, fgSize: 80, output: join(ASSETS, 'notification-icon.png') })

  // g) splash-icon.png — fond transparent, logo 800px de large centré
  await placeOnCanvas({ size: S, bg: CLEAR, fg: SRC_LOGO, fgSize: 800, output: join(ASSETS, 'splash-icon.png') })

  // h) logo-pixsell.png — 512×512, fond transparent, logo 460px de large centré
  await placeOnCanvas({ size: 512, bg: CLEAR, fg: SRC_LOGO, fgSize: 460, output: join(ASSETS, 'logo-pixsell.png') })

  // i) favicon.png — 48×48, oiseau coloré fond transparent
  await placeOnCanvas({ size: 48, bg: CLEAR, fg: birdNoBg, fgSize: 40, output: join(ASSETS, 'favicon.png') })

  console.log('\n✅  Tous les fichiers générés.')
}

main().catch(err => { console.error(err); process.exit(1) })
