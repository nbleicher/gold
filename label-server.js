#!/usr/bin/env node
/**
 * label-server.js — Katasymbol T50M Pro USB Print Bridge
 *
 * Runs locally on the Mac. Accepts print jobs from the Gold web app
 * and sends them directly to the T50M Pro over USB HID.
 *
 * Setup (one-time):
 *   brew install pkg-config cairo pango libpng jpeg giflib librsvg
 *   npm install node-hid canvas
 *
 * Run:
 *   node label-server.js
 *
 * The server listens on http://127.0.0.1:4242
 *   POST /print   { "stickerCode": "A1C", "weightGrams": 0.85 }
 *   GET  /status  → { "printerFound": true }
 */

'use strict';

const http       = require('http');
const { execSync } = require('child_process');
const os         = require('os');
const path       = require('path');
const fs         = require('fs');
const HID        = require('node-hid');
const { createCanvas } = require('canvas');

// ─── Printer constants (T50M Pro) ────────────────────────────────────────────

const VENDOR_ID         = 0x1820;
const DPI               = 203;
const TAPE_WIDTH_DOTS   = 384;   // full print-head width in dots
const TAPE_WIDTH_BYTES  = 48;    // 384 / 8
const LZMA_BUFFER_SIZE  = 32768; // fixed buffer size the printer expects

// Label dimensions for a 1.25" × 1.25" dime bag (25mm × 16mm label)
const LABEL_HEIGHT_MM   = 16;
const LABEL_HEIGHT_DOTS = Math.round(LABEL_HEIGHT_MM * DPI / 25.4); // ~128

// ─── Protocol command packets (all 64 bytes, zero-padded) ────────────────────

function pad64(...bytes) {
  const buf = Buffer.alloc(64, 0);
  bytes.forEach((b, i) => { buf[i] = b; });
  return buf;
}

const CMD_STATUS_POLL = pad64(0xc0, 0x40, 0x00, 0x00, 0x11, 0x00, 0x08, 0x00);
const CMD_PRE_PRINT   = pad64(0xc0, 0x40, 0x01, 0x04, 0x5c, 0x00, 0x08, 0x00);
const CMD_EXECUTE     = pad64(0xc0, 0x40, 0x01, 0x04, 0x10, 0x00, 0x08, 0x00, 0x00, 0x3c);

// ─── HID helpers ─────────────────────────────────────────────────────────────

/**
 * Write a 64-byte command packet.
 * node-hid requires a leading 0x00 "report ID" byte for devices that
 * don't use numbered reports — the device receives exactly 64 bytes.
 */
function sendPacket(device, buf64) {
  const out = [0, ...buf64];
  device.write(out);
}

function readResponse(device, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`HID read timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
    device.once('data', data => { clearTimeout(timer); resolve(data); });
    device.once('error', err  => { clearTimeout(timer); reject(err);  });
  });
}

// ─── Label rendering ─────────────────────────────────────────────────────────

/**
 * Render sticker code + weight into a 1-bit bitmap.
 * Returns a Buffer of TAPE_WIDTH_BYTES × LABEL_HEIGHT_DOTS bytes.
 * Black pixel (ink) = bit 1, white = bit 0.
 */
function renderBitmap(stickerCode, weightGrams) {
  const W = TAPE_WIDTH_DOTS;
  const H = LABEL_HEIGHT_DOTS;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // White background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, W, H);

  // Sticker code — bold, large, centered
  ctx.fillStyle    = 'black';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = 'bold 62px monospace';
  ctx.fillText(stickerCode, W / 2, H * 0.37);

  // Weight — smaller, centered below
  ctx.font = '26px monospace';
  ctx.fillText(`${weightGrams.toFixed(4)} g`, W / 2, H * 0.73);

  // Convert RGBA canvas → 1-bit packed bitmap (MSB first, black = 1)
  const imgData = ctx.getImageData(0, 0, W, H).data;
  const bitmap  = Buffer.alloc(TAPE_WIDTH_BYTES * H, 0);

  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const px  = (row * W + col) * 4;
      const lum = (imgData[px] + imgData[px + 1] + imgData[px + 2]) / 3;
      if (lum < 128) { // dark pixel → ink dot
        const byteIdx = row * TAPE_WIDTH_BYTES + Math.floor(col / 8);
        const bitIdx  = 7 - (col % 8); // MSB first
        bitmap[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  return bitmap;
}

// ─── Payload assembly + LZMA compression ─────────────────────────────────────

/**
 * Build the 32768-byte buffer the printer expects:
 *   12-byte header  +  bitmap data  +  zero padding to 32768
 *
 * Header format (little-endian uint16 pairs, from protocol capture):
 *   [0-1]  height in dots
 *   [2-3]  0x5002  (unknown constant)
 *   [4-5]  0x0054  (unknown constant)
 *   [6-7]  bytes per row (48)
 *   [8-9]  0x0001  (unknown constant)
 *  [10-11] 0x0001  (unknown constant)
 */
function buildBuffer(bitmap) {
  const buf = Buffer.alloc(LZMA_BUFFER_SIZE, 0);
  buf.writeUInt16LE(LABEL_HEIGHT_DOTS, 0);
  buf.writeUInt16LE(0x5002,            2);
  buf.writeUInt16LE(0x0054,            4);
  buf.writeUInt16LE(TAPE_WIDTH_BYTES,  6);
  buf.writeUInt16LE(0x0001,            8);
  buf.writeUInt16LE(0x0001,           10);
  bitmap.copy(buf, 12);
  return buf;
}

/**
 * LZMA-compress the 32768-byte buffer using Python 3's built-in lzma module
 * (FORMAT_ALONE — matches the captured printer protocol exactly).
 * Python 3 ships with macOS, so no extra dependency is needed here.
 */
function lzmaCompress(buffer) {
  const tmpIn  = path.join(os.tmpdir(), `label_in_${process.pid}.bin`);
  const tmpOut = path.join(os.tmpdir(), `label_out_${process.pid}.lzma`);
  try {
    fs.writeFileSync(tmpIn, buffer);
    execSync(
      `python3 -c "` +
      `import lzma,sys; ` +
      `d=open('${tmpIn}','rb').read(); ` +
      `c=lzma.compress(d,format=lzma.FORMAT_ALONE,preset=1); ` +
      `open('${tmpOut}','wb').write(c)"`,
      { stdio: 'pipe' }
    );
    return fs.readFileSync(tmpOut);
  } finally {
    try { fs.unlinkSync(tmpIn);  } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

// ─── Main print function ──────────────────────────────────────────────────────

async function printLabel(stickerCode, weightGrams) {
  console.log(`\n[print] ${stickerCode}  ${weightGrams.toFixed(4)} g`);

  // 1. Find printer
  const allDevices  = HID.devices();
  const printerInfo = allDevices.find(d => d.vendorId === VENDOR_ID);
  if (!printerInfo) {
    throw new Error('T50M Pro not found — make sure it is connected via USB and powered on.');
  }
  console.log(`[print] Found: ${printerInfo.manufacturer || ''} ${printerInfo.product || ''}`);

  const device = new HID.HID(printerInfo.path);
  device.setNonBlocking(false);

  try {
    // 2. Poll status — confirm printer is ready
    sendPacket(device, CMD_STATUS_POLL);
    const status = await readResponse(device);
    const statusByte = status[2];
    console.log(`[print] Status: 0x${Buffer.from(status).slice(0,8).toString('hex')}`);
    // Status byte 0x04 = ready with paper; 0x00 = idle. Anything else = error.
    if (statusByte !== 0x04 && statusByte !== 0x00) {
      throw new Error(`Printer not ready (status 0x${statusByte.toString(16)}). Check paper is loaded.`);
    }

    // 3. Render bitmap
    console.log('[print] Rendering bitmap...');
    const bitmap = renderBitmap(stickerCode, weightGrams);

    // 4. Build 32768-byte buffer and LZMA compress
    console.log('[print] Compressing...');
    const rawBuffer  = buildBuffer(bitmap);
    const compressed = lzmaCompress(rawBuffer);
    console.log(`[print] Compressed: ${compressed.length} bytes → ${compressed.length} HID packets`);

    // 5. Send pre-print command
    sendPacket(device, CMD_PRE_PRINT);
    await readResponse(device);

    // 6. Stream compressed data in 64-byte HID chunks
    console.log('[print] Sending image data...');
    let offset = 0;
    let packets = 0;
    while (offset < compressed.length) {
      const chunk = Buffer.alloc(64, 0);
      const n = Math.min(64, compressed.length - offset);
      compressed.copy(chunk, 0, offset, offset + n);
      sendPacket(device, chunk);
      offset  += n;
      packets += 1;
    }
    console.log(`[print] Sent ${packets} data packets`);

    // 7. Send execute / print command
    sendPacket(device, CMD_EXECUTE);
    const result = await readResponse(device, 6000);
    console.log(`[print] Done. Response: 0x${Buffer.from(result).slice(0,8).toString('hex')}`);

  } finally {
    device.close();
  }
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  // POST /print
  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { stickerCode, weightGrams } = JSON.parse(body);
        if (!stickerCode || weightGrams == null) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing stickerCode or weightGrams' }));
          return;
        }
        await printLabel(String(stickerCode), parseFloat(weightGrams));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('[print] Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /status
  if (req.method === 'GET' && req.url === '/status') {
    const found = HID.devices().some(d => d.vendorId === VENDOR_ID);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ printerFound: found }));
    return;
  }

  res.writeHead(404); res.end();
});

const PORT = 4242;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  Gold Label Server  — port ${PORT}     ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(`POST /print  { stickerCode, weightGrams }`);
  console.log(`GET  /status`);

  const printer = HID.devices().find(d => d.vendorId === VENDOR_ID);
  if (printer) {
    console.log(`\n✓ T50M Pro detected: ${printer.product || 'Unknown'}`);
  } else {
    console.log(`\n⚠  T50M Pro not found — connect via USB before printing`);
  }
  console.log('');
});
