import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../resources/block-screen-presets");
const size = 64;
const blue = [0x3e, 0x64, 0x8c];
const cream = [0xef, 0xf9, 0xee];
const pale = [0xd7, 0xe1, 0xd6];
const mist = [0x9f, 0xbf, 0xd4];

function png(draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const pixel = Buffer.alloc(4);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = draw(x, y);
      pixel[0] = r;
      pixel[1] = g;
      pixel[2] = b;
      pixel[3] = a;
      pixel.copy(raw, row + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function blend(base, color, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(base[0] + (color[0] - base[0]) * t),
    Math.round(base[1] + (color[1] - base[1]) * t),
    Math.round(base[2] + (color[2] - base[2]) * t),
    255,
  ];
}

function glowPng() {
  return png((x, y) => {
    const dx = x - 31.5;
    const dy = y - 31.5;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return blend(blue, cream, 1 - distance / 22);
  });
}

function leafPng() {
  return png((x, y) => {
    const dx = (x - 32) / 16;
    const dy = (y - 34) / 22;
    const leaf = dx * dx + dy * dy < 1 && y < 48;
    const stem = Math.abs(x - 32) < 1.4 && y > 30 && y < 54;
    if (leaf || stem) return [...pale, 255];
    return [...blue, 255];
  });
}

const palette = [blue, cream, pale, mist, [0xff, 0xff, 0xff], [0x1d, 0x3d, 0x5c]];

function nearest(color) {
  let best = 0;
  let score = Infinity;
  palette.forEach((entry, index) => {
    const distance = (entry[0] - color[0]) ** 2 + (entry[1] - color[1]) ** 2 + (entry[2] - color[2]) ** 2;
    if (distance < score) {
      score = distance;
      best = index;
    }
  });
  return best;
}

function lzw(pixels, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  const table = new Map();
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  const write = (code) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(buffer & 255);
      buffer >>= 8;
      bits -= 8;
    }
  };
  const reset = () => {
    table.clear();
    codeSize = minCodeSize + 1;
    next = eoi + 1;
    write(clear);
  };
  const codeFor = (phrase) => (phrase.length === 1 ? phrase.charCodeAt(0) : table.get(phrase));
  reset();
  let phrase = String.fromCharCode(pixels[0]);
  for (let index = 1; index < pixels.length; index += 1) {
    const nextPhrase = phrase + String.fromCharCode(pixels[index]);
    if (nextPhrase.length === 1 || table.has(nextPhrase)) {
      phrase = nextPhrase;
      continue;
    }
    write(codeFor(phrase));
    if (next < 4096) {
      table.set(nextPhrase, next);
      next += 1;
      if (next === 1 << codeSize && codeSize < 12) codeSize += 1;
    } else {
      reset();
    }
    phrase = String.fromCharCode(pixels[index]);
  }
  write(codeFor(phrase));
  write(eoi);
  if (bits > 0) bytes.push(buffer & 255);
  return Buffer.from(bytes);
}

function gif(frames) {
  const minCodeSize = 4;
  const header = Buffer.from("GIF89a");
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(size, 0);
  screen.writeUInt16LE(size, 2);
  screen[4] = 0xf3;
  const colors = Buffer.alloc(16 * 3);
  palette.forEach((color, index) => {
    colors[index * 3] = color[0];
    colors[index * 3 + 1] = color[1];
    colors[index * 3 + 2] = color[2];
  });
  const loop = Buffer.concat([
    Buffer.from([0x21, 0xff, 0x0b]),
    Buffer.from("NETSCAPE2.0"),
    Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00]),
  ]);
  const body = frames.map((indexes) => {
    const control = Buffer.from([0x21, 0xf9, 0x04, 0x08, 0x08, 0x00, 0x00, 0x00]);
    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(size, 5);
    descriptor.writeUInt16LE(size, 7);
    const compressed = lzw(indexes, minCodeSize);
    const blocks = [Buffer.from([minCodeSize])];
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const slice = compressed.subarray(offset, offset + 255);
      blocks.push(Buffer.from([slice.length]), slice);
    }
    blocks.push(Buffer.from([0]));
    return Buffer.concat([control, descriptor, ...blocks]);
  });
  return Buffer.concat([header, screen, colors, loop, ...body, Buffer.from([0x3b])]);
}

function frame(draw) {
  const indexes = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) indexes[y * size + x] = nearest(draw(x, y));
  }
  return indexes;
}

function pulseGif() {
  return gif(Array.from({ length: 12 }, (_, step) => frame((x, y) => {
    const radius = 12 + Math.sin((step / 12) * Math.PI * 2) * 6;
    const distance = Math.hypot(x - 31.5, y - 31.5);
    return distance < radius ? cream : blue;
  })));
}

function ringsGif() {
  return gif(Array.from({ length: 12 }, (_, step) => frame((x, y) => {
    const distance = Math.hypot(x - 31.5, y - 31.5);
    const ring = (step / 12) * 26;
    const band = Math.abs(distance - ring);
    if (band < 2.2) return cream;
    if (Math.abs(distance - ((ring + 13) % 26)) < 1.4) return mist;
    return blue;
  })));
}

function riseGif() {
  return gif(Array.from({ length: 12 }, (_, step) => frame((x, y) => {
    const center = 46 - ((step % 12) / 12) * 36;
    const distance = Math.hypot(x - 32, y - center);
    if (distance < 8) return cream;
    if (distance < 14) return pale;
    return blue;
  })));
}

mkdirSync(root, { recursive: true });
writeFileSync(join(root, "glow.png"), glowPng());
writeFileSync(join(root, "leaf.png"), leafPng());
writeFileSync(join(root, "pulse.gif"), pulseGif());
writeFileSync(join(root, "rings.gif"), ringsGif());
writeFileSync(join(root, "rise.gif"), riseGif());
writeFileSync(join(root, "manifest.json"), JSON.stringify([
  { file: "glow.png", label: "Glow" },
  { file: "leaf.png", label: "Leaf" },
  { file: "pulse.gif", label: "Pulse" },
  { file: "rings.gif", label: "Rings" },
  { file: "rise.gif", label: "Rise" },
], null, 2));
