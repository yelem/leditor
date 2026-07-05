// Генерация иконок приложения (PNG + ICO + ICNS) без внешних ассетов.
// Рисуем «лист книги» в тёплой палитре программы. Запуск: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import png2icons from 'png2icons'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 1024

// --- Рисование в RGBA-буфер ---
const rgba = Buffer.alloc(SIZE * SIZE * 4) // прозрачный фон
const set = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  // простое наложение поверх
  const ia = a / 255
  rgba[i] = Math.round(r * ia + rgba[i] * (1 - ia))
  rgba[i + 1] = Math.round(g * ia + rgba[i + 1] * (1 - ia))
  rgba[i + 2] = Math.round(b * ia + rgba[i + 2] * (1 - ia))
  rgba[i + 3] = Math.max(rgba[i + 3], a)
}

const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

const fillEllipse = (cx, cy, rx, ry, [r0, g0, b0], a = 255) => {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, r0, g0, b0, a)
    }
  }
}

// Фон-плитка (акцент программы, тёплый коричневый, с лёгким верт. градиентом).
for (let y = 0; y < SIZE; y++) {
  const t = y / SIZE
  const r = Math.round(186 - 26 * t)
  const g = Math.round(132 - 24 * t)
  const b = Math.round(70 - 16 * t)
  for (let x = 0; x < SIZE; x++) {
    if (inRoundRect(x, y, 48, 48, SIZE - 48, SIZE - 48, 210)) set(x, y, r, g, b)
  }
}

// Кошачья лапка: крупная подушечка + 4 пальчика, кремовым цветом.
const paw = [249, 245, 238]
fillEllipse(512, 672, 238, 196, paw) // основная подушечка
fillEllipse(322, 452, 86, 108, paw) // пальчик 1
fillEllipse(444, 360, 92, 118, paw) // пальчик 2
fillEllipse(580, 360, 92, 118, paw) // пальчик 3
fillEllipse(702, 452, 86, 108, paw) // пальчик 4

// --- Кодирование PNG (RGBA, 8 бит) ---
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const stride = SIZE * 4
const raw = Buffer.alloc((stride + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (stride + 1)] = 0
  rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

writeFileSync(join(root, 'resources', 'icon.png'), png)
writeFileSync(join(root, 'resources', 'icon.ico'), png2icons.createICO(png, png2icons.BICUBIC, 0, false, true))
writeFileSync(join(root, 'resources', 'icon.icns'), png2icons.createICNS(png, png2icons.BICUBIC, 0))
console.log('Иконки готовы: resources/icon.{png,ico,icns}')
