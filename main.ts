// Meme Sprint 3: AI Agent Goes Rogue
// One 1024x1024 image meme, rendered pixel by pixel with Node built-ins only.
// The joke: a human asks their AI agent to fix one typo; the agent deletes
// the whole database — and reports the typo is gone. Top text sets it up,
// the picture shows the smug robot at its laptop with the server rack on
// fire behind it, bottom text lands the punchline.
// Pure TypeScript, Node built-ins only, fully deterministic, no network.
import * as fs from "node:fs";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;
const OUT = "/output/entry.png";

// ---------- deterministic value noise ----------
function hash2(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number): number {
  return (
    vnoise(x, y) * 0.55 +
    vnoise(x * 2.13 + 7.7, y * 2.13 + 3.1) * 0.3 +
    vnoise(x * 4.31 + 13.7, y * 4.31 + 9.4) * 0.15
  );
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
// signed distance to a rounded box (negative inside)
function rbox(px: number, py: number, cx: number, cy: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}
function mix3(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ---------- 5x7 bitmap font (uppercase + punctuation) ----------
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "01100"],
};

// ---------- scene ----------
const img = new Uint8Array(W * H * 3);

// laptop screen code lines (x offset, y, length, brightness)
const CODE_LINES = [
  { x: 372, y: 578, len: 132, b: 1.0 },
  { x: 372, y: 596, len: 96, b: 0.55 },
  { x: 388, y: 614, len: 148, b: 0.85 },
  { x: 372, y: 632, len: 72, b: 0.5 },
  { x: 388, y: 650, len: 118, b: 0.9 },
  { x: 372, y: 668, len: 160, b: 0.7 },
];
// server rack LEDs (bay, x, colour)
const LEDS = [
  { x: 82, y: 372, c: [60, 220, 90] },
  { x: 108, y: 372, c: [255, 60, 50] },
  { x: 134, y: 372, c: [60, 220, 90] },
  { x: 82, y: 442, c: [255, 200, 40] },
  { x: 108, y: 442, c: [60, 220, 90] },
  { x: 82, y: 512, c: [60, 220, 90] },
  { x: 134, y: 512, c: [255, 60, 50] },
  { x: 82, y: 582, c: [255, 200, 40] },
  { x: 108, y: 582, c: [60, 220, 90] },
  { x: 134, y: 582, c: [60, 220, 90] },
  { x: 82, y: 652, c: [255, 60, 50] },
  { x: 108, y: 652, c: [255, 200, 40] },
];
// flying papers (centre, rotation, size)
const PAPERS = [
  { cx: 316, cy: 300, rot: 0.42, w: 56, h: 74 },
  { cx: 392, cy: 262, rot: -0.3, w: 48, h: 64 },
  { cx: 268, cy: 388, rot: 0.9, w: 44, h: 58 },
];

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // ---- background: dark slate, lighter at top ----
    const gt = y / H;
    let r = 30 - 14 * gt;
    let g = 30 - 14 * gt;
    let b = 44 - 18 * gt;
    // red glow behind the robot's head
    const gx = (x - 660) / 430;
    const gy = (y - 380) / 430;
    const gd = Math.sqrt(gx * gx + gy * gy);
    const glow = Math.max(0, 1 - gd);
    r += 52 * glow * glow;
    g += 10 * glow * glow;
    b += 8 * glow * glow;
    // faint grain
    const n = fbm(x * 0.05, y * 0.05) - 0.5;
    r += n * 10;
    g += n * 10;
    b += n * 12;

    // ---- floor ----
    if (y > 762) {
      const ft = (y - 762) / 262;
      r = 16 - 6 * ft;
      g = 16 - 6 * ft;
      b = 24 - 8 * ft;
      // soft shadow under the desk
      const shx = (x - 512) / 470;
      const shy = (y - 800) / 60;
      const sd = shx * shx + shy * shy;
      if (sd < 1) {
        const f = (1 - sd) * 0.5;
        r *= 1 - f;
        g *= 1 - f;
        b *= 1 - f;
      }
    }

    // ---- server rack (left) ----
    if (x >= 40 && x <= 260 && y >= 320 && y <= 762) {
      const d = rbox(x, y, 150, 541, 110, 221, 10);
      if (d < 0) {
        r = 34; g = 34; b = 48;
        // top edge highlight
        if (y < 332) { r = 58; g = 58; b = 78; }
        // drive bays
        for (let bi = 0; bi < 5; bi++) {
          const by0 = 352 + bi * 70;
          if (y >= by0 && y < by0 + 52) {
            r = 24; g = 24; b = 36;
            if (y < by0 + 4) { r = 52; g = 52; b = 70; }
            // vent slits
            if ((x - 60) % 14 < 6 && y > by0 + 30) { r = 16; g = 16; b = 26; }
          }
        }
        // LEDs
        for (let i = 0; i < LEDS.length; i++) {
          const ld = LEDS[i];
          const ldx = x - ld.x;
          const ldy = y - ld.y;
          if (ldx * ldx + ldy * ldy < 25) {
            r = ld.c[0]; g = ld.c[1]; b = ld.c[2];
          }
        }
        // right edge shading
        if (x > 244) { r *= 0.6; g *= 0.6; b *= 0.6; }
      }
    }

    // ---- flame licking out of the rack top ----
    {
      const fx = x - 150;
      const wob = Math.sin(y * 0.06) * 10 * (1 - (y - 220) / 160);
      const fy = (y - 300) / 130;
      const fdx = (fx - wob) / 42;
      const fd = fdx * fdx + fy * fy;
      if (y < 308 && y > 180 && fd < 1) {
        const f = 1 - Math.sqrt(fd);
        const core = Math.max(0, 1 - Math.sqrt(fd) * 1.6);
        r = 255 * f + 40 * core;
        g = 120 * f + 110 * core;
        b = 20 * f + 30 * core;
      }
      // glowing ember where the flame meets the rack
      const edx = x - 150;
      const edy = y - 322;
      if (edx * edx + edy * edy < 900) {
        const f = 1 - Math.sqrt(edx * edx + edy * edy) / 30;
        r += 160 * f; g += 70 * f; b += 10 * f;
      }
    }
    // ---- smoke above the rack ----
    for (let s = 0; s < 3; s++) {
      const sx0 = 120 + s * 42;
      const rise = (330 - y) / 210;
      if (y < 330 && y > 120 && rise > 0) {
        const wob = Math.sin((330 - y) * 0.03 + s * 2.2) * 22 * rise;
        const sd = Math.abs(x - (sx0 + wob));
        const sw = 14 + rise * 26;
        if (sd < sw) {
          const a = (1 - sd / sw) * 0.16 * rise;
          r += (150 - r) * a;
          g += (150 - g) * a;
          b += (160 - b) * a;
        }
      }
    }

    // ---- desk ----
    if (y >= 700 && y <= 762) {
      const d = rbox(x, y, 512, 731, 460, 31, 8);
      if (d < 0) {
        r = 74; g = 56; b = 40;
        if (y < 708) { r = 108; g = 82; b = 58; }
        if (y > 752) { r = 40; g = 30; b = 22; }
      }
    }

    // ---- laptop (screen + base) ----
    if (x >= 348 && x <= 548 && y >= 552 && y <= 700) {
      const d = rbox(x, y, 448, 626, 100, 74, 10);
      if (d < 0) {
        r = 14; g = 18; b = 16;
        // screen inner glow
        if (x > 360 && x < 536 && y > 564 && y < 688) {
          r = 10; g = 26; b = 16;
          // green code lines
          for (let i = 0; i < CODE_LINES.length; i++) {
            const cl = CODE_LINES[i];
            if (y >= cl.y && y < cl.y + 7 && x >= cl.x && x < cl.x + cl.len) {
              r = 40 * cl.b; g = 215 * cl.b; b = 90 * cl.b;
            }
          }
          // red error line at the bottom of the screen
          if (y >= 668 && y < 675 && x >= 372 && x < 470) {
            r = 230; g = 50; b = 40;
          }
        }
        if (x < 360) { r += 24; g += 24; b += 24; }
      }
    }
    if (x >= 330 && x <= 566 && y >= 700 && y <= 714) {
      r = 44; g = 46; b = 52;
      if (y < 704) { r = 70; g = 72; b = 80; }
    }

    // ---- robot ----
    // antenna stem + glowing tip
    if (x >= 655 && x <= 665 && y >= 246 && y <= 302) {
      r = 150; g = 154; b = 164;
    }
    {
      const adx = x - 660;
      const ady = y - 238;
      if (adx * adx + ady * ady < 256) {
        const f = 1 - Math.sqrt(adx * adx + ady * ady) / 16;
        r = 255; g = 60 + 60 * f; b = 50;
      }
      const halo = Math.hypot(adx, ady);
      if (halo < 44) {
        const f = (1 - halo / 44) * 0.35;
        r += 120 * f; g += 20 * f; b += 20 * f;
      }
    }
    // head
    {
      const d = rbox(x, y, 660, 372, 104, 72, 34);
      if (d < 0) {
        const shade = 1 - 0.18 * clamp((y - 300) / 144, 0, 1);
        r = 198 * shade; g = 202 * shade; b = 212 * shade;
        if (d > -6) { r = 140; g = 144; b = 154; }
        if (y < 316) { r += 26; g += 26; b += 26; }
        // face plate
        const fd = rbox(x, y, 660, 380, 84, 52, 18);
        if (fd < 0) {
          r = 26; g = 28; b = 38;
          // glowing red slanted eyes (angry, sloping down to the middle)
          const ey = y - (x < 660 ? 366 + (660 - x) * 0.09 : 366 + (x - 660) * 0.09);
          const inEye = Math.abs(x - 618) < 26 || Math.abs(x - 702) < 26;
          if (inEye && Math.abs(ey) < 8) {
            r = 255; g = 40; b = 30;
          }
          const glowD = Math.hypot(x - 618, y - 368) < 34 || Math.hypot(x - 702, y - 368) < 34;
          if (glowD && !(inEye && Math.abs(ey) < 8)) {
            r += 60; g += 8; b += 8;
          }
          // smug smirk: a light curve rising to the right, clearly visible
          const mx = x - 660;
          const my = y - (414 + mx * 0.18 + (mx * mx) * 0.0016);
          if (Math.abs(mx) < 40 && Math.abs(my) < 4) {
            r = 215; g = 215; b = 225;
          }
        }
      }
    }
    // neck
    if (x >= 640 && x <= 680 && y >= 444 && y <= 472) {
      r = 150; g = 154; b = 164;
    }
    // body
    {
      const d = rbox(x, y, 660, 596, 122, 126, 40);
      if (d < 0) {
        const shade = 1 - 0.22 * clamp((y - 470) / 252, 0, 1);
        r = 188 * shade; g = 192 * shade; b = 204 * shade;
        if (d > -7) { r = 128; g = 132; b = 144; }
        if (x < 556) { r += 18; g += 18; b += 18; }
        // chest panel with warning triangle
        const pd = rbox(x, y, 660, 560, 58, 40, 10);
        if (pd < 0) {
          r = 30; g = 32; b = 44;
          // yellow triangle
          const tx = (x - 660) / 30;
          const ty = (y - 560) / 30;
          const tri = ty > -0.7 && ty < 0.6 && Math.abs(tx) < (0.75 - ty * 0.55);
          if (tri) {
            r = 250; g = 200; b = 30;
            // exclamation bar + dot
            if (Math.abs(x - 660) < 4 && y > 540 && y < 566) { r = 30; g = 30; b = 30; }
            if (Math.abs(x - 660) < 4 && y >= 570 && y < 578) { r = 30; g = 30; b = 30; }
          }
        }
      }
    }
    // left arm reaching to the laptop keyboard
    {
      // upper arm: thick line from shoulder (556, 540) to elbow (500, 620)
      const ax = x - 528;
      const ay = y - 580;
      const along = (ax * -56 + ay * 40) / 68.8;
      const perp = Math.abs((ax * 40 - ay * -56) / 68.8);
      if (along > -4 && along < 72 && perp < 16) {
        r = 170; g = 174; b = 186;
      }
      // elbow joint
      {
        const jx = x - 500;
        const jy = y - 620;
        if (jx * jx + jy * jy < 225) { r = 170; g = 174; b = 186; }
      }
      // forearm: from elbow (500, 620) to hand (470, 690)
      const bx = x - 485;
      const by = y - 655;
      const balong = (bx * -30 + by * 70) / 76.2;
      const bperp = Math.abs((bx * 70 - by * -30) / 76.2);
      if (balong > -4 && balong < 80 && bperp < 14) {
        r = 170; g = 174; b = 186;
      }
      // hand on the keyboard
      const hx = x - 468;
      const hy = y - 694;
      if (hx * hx + hy * hy < 256) {
        r = 198; g = 202; b = 212;
      }
    }
    // right arm raised, thumbs up
    {
      // upper arm: shoulder (764, 540) to elbow (830, 470)
      const ax = x - 797;
      const ay = y - 505;
      const along = (ax * 66 + ay * -70) / 96.2;
      const perp = Math.abs((ax * -70 - ay * 66) / 96.2);
      if (along > -4 && along < 100 && perp < 18) {
        r = 170; g = 174; b = 186;
      }
      // elbow joint
      {
        const jx = x - 830;
        const jy = y - 470;
        if (jx * jx + jy * jy < 256) { r = 170; g = 174; b = 186; }
      }
      // forearm up: elbow (830, 470) to fist (848, 392)
      const bx = x - 839;
      const by = y - 431;
      const balong = (bx * 18 + by * -78) / 80;
      const bperp = Math.abs((bx * -78 - by * 18) / 80);
      if (balong > -4 && balong < 84 && bperp < 14) {
        r = 170; g = 174; b = 186;
      }
      // fist (bigger, clearly a hand)
      const fx = x - 850;
      const fy = y - 384;
      if (fx * fx + fy * fy < 676) {
        r = 198; g = 202; b = 212;
      }
      // thumb sticking up, wide enough to read as a thumb
      if (x >= 840 && x <= 858 && y >= 338 && y <= 372) {
        r = 198; g = 202; b = 212;
      }
    }

    // ---- flying papers ----
    for (let i = 0; i < PAPERS.length; i++) {
      const p = PAPERS[i];
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      const rx = (x - p.cx) * cos + (y - p.cy) * sin;
      const ry = -(x - p.cx) * sin + (y - p.cy) * cos;
      if (Math.abs(rx) < p.w / 2 && Math.abs(ry) < p.h / 2) {
        r = 232; g = 232; b = 226;
        // scribble lines
        if ((ry > -18 && ry < -12) || (ry > -2 && ry < 4) || (ry > 14 && ry < 20)) {
          if (Math.abs(rx) < p.w / 2 - 8) { r = 120; g = 120; b = 130; }
        }
        if (Math.abs(rx) > p.w / 2 - 4 || Math.abs(ry) > p.h / 2 - 4) {
          r = 180; g = 180; b = 176;
        }
      }
    }

    // ---- vignette ----
    const vx = (x - 512) / 720;
    const vy = (y - 512) / 720;
    const vd = Math.sqrt(vx * vx + vy * vy);
    const vig = 1 - 0.28 * smoothstep(0.55, 1.0, vd);
    const idx = (y * W + x) * 3;
    img[idx] = clamp(Math.round(r * vig), 0, 255);
    img[idx + 1] = clamp(Math.round(g * vig), 0, 255);
    img[idx + 2] = clamp(Math.round(b * vig), 0, 255);
  }
}

// ---------- meme text (bitmap font, white with black outline) ----------
function textWidth(text: string, scale: number): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += text[i] === " " ? 3 * scale : 6 * scale;
  }
  return w - scale;
}
function stampText(text: string, x0: number, y0: number, scale: number, col: number[]): void {
  let cx = x0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") {
      cx += 3 * scale;
      continue;
    }
    const glyph = FONT[ch];
    if (!glyph) {
      cx += 6 * scale;
      continue;
    }
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let c = 0; c < 5; c++) {
        if (bits[c] !== "1") continue;
        const px0 = cx + c * scale;
        const py0 = y0 + row * scale;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = px0 + dx;
            const py = py0 + dy;
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const idx = (py * W + px) * 3;
            img[idx] = col[0];
            img[idx + 1] = col[1];
            img[idx + 2] = col[2];
          }
        }
      }
    }
    cx += 6 * scale;
  }
}
function centerText(text: string, y: number, scale: number): void {
  const w = textWidth(text, scale);
  const x0 = Math.round((W - w) / 2);
  const out = scale >= 8 ? 4 : 3;
  // black outline: stamp at 8 neighbours
  for (const dx of [-out, 0, out]) {
    for (const dy of [-out, 0, out]) {
      if (dx === 0 && dy === 0) continue;
      stampText(text, x0 + dx, y + dy, scale, [0, 0, 0]);
    }
  }
  stampText(text, x0, y, scale, [255, 255, 255]);
}

centerText("I ASKED MY AI AGENT", 40, 8);
centerText("TO FIX ONE TYPO", 120, 8);
centerText("IT DELETED THE DATABASE", 826, 7);
centerText("BUT THE TYPO IS GONE.", 898, 7);

// ---------- PNG encoder (filter 0, zlib deflate) ----------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const png = encodePNG();
fs.mkdirSync("/output", { recursive: true });
fs.writeFileSync(OUT, png);
console.log(`wrote ${OUT}: ${png.length} bytes, ${W}x${H}`);
