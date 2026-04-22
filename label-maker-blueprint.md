# Label Maker Integration — Implementation Blueprint

**Project:** Gold Inventory Platform  
**Printer:** Katasymbol T50M Pro (USB HID, VID 0x1820)  
**Label Size:** 25mm × 16mm (fits on 1.25" × 1.25" dime bag, ~3mm margin each side)  
**Trigger:** Manual "Print Label" button per bag order row  
**Data printed:** Sticker code + weight in grams  
**Status:** Fully implemented ✓

---

## Architecture

```
Web app (Print button)
        ↓
fetch POST http://127.0.0.1:4242/print
        ↓
label-server.js  (runs locally on Mac)
        ↓
USB HID interrupt transfers (64 bytes/packet)
        ↓
Katasymbol T50M Pro
```

---

## Files

| File | Purpose |
|------|---------|
| `label-server.js` | Local Node.js print bridge — USB HID communication |
| `apps/web/src/utils/printLabel.ts` | Frontend utility — calls the local server |
| `apps/web/src/pages/OrdersPage.tsx` | Print button already wired to `printLabel()` |

---

## Setup (one-time)

### 1. Install canvas system dependencies
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

### 2. Install npm packages
```bash
npm install node-hid canvas
```

### 3. Start the label server
```bash
npm run label-server
# or: node label-server.js
```

Keep this terminal open whenever you are doing inventory management. The server prints a confirmation if the T50M Pro is detected.

### 4. Smoke-check the bridge (optional)

With the server running:

```bash
curl -s http://127.0.0.1:4242/health
```

Expect JSON like `{ "ok": true, "printerFound": true/false, "python3Lzma": true }`.  
`printerFound` only means the USB device was enumerated — it does not open HID until you print.

**Down-server check:** With nothing listening on `4242`, the web app **Print** button should show an alert telling you to start the server (and notes HTTPS/mixed-content if applicable).

---

## Runtime vs protocol

| Layer | What you need |
|--------|----------------|
| **Environment** | `node-hid`, `canvas` (+ Homebrew cairo stack), **Python 3** with stdlib `lzma` |
| **Process** | `label-server.js` listening on `127.0.0.1:4242` |
| **Wire format** | HID 64-byte packets, 32768-byte padded bitmap, LZMA ALONE — details below |

---

## T50M Pro USB Protocol (fully reverse-engineered)

### Connection
- **VID:** `0x1820` (all SUPVAN/Katasymbol models)
- **Interface:** USB HID, Interrupt endpoint
- **Packet size:** 64 bytes per packet
- **Report ID:** None (device uses report ID 0 — prefix all `node-hid` writes with `0x00`)

### Command packet format (host → printer)
All commands are 64 bytes, zero-padded:

| Command | Bytes (hex) |
|---------|-------------|
| Status poll | `c0 40 00 00 11 00 08 00` + 56 zeros |
| Pre-print | `c0 40 01 04 5c 00 08 00` + 56 zeros |
| Execute/print | `c0 40 01 04 10 00 08 00 00 3c 00` + 53 zeros |

### Status response (printer → host)
`08 00 [status] [state] [device info...]`
- Byte[2]: `0x04` = ready with paper, `0x00` = idle

### Print sequence
1. Send **status poll** → read response (verify printer ready)
2. Render label as 1-bit bitmap
3. Build 32768-byte buffer (header + bitmap + zero padding)
4. LZMA compress (FORMAT_ALONE)
5. Send **pre-print command** → read response
6. Send compressed data as sequential 64-byte HID packets
7. Send **execute command** → read response

---

## Bitmap format (from Wireshark capture analysis)

### Buffer structure (32768 bytes total, always)
```
Offset  Size   Value         Description
0       2      uint16 LE     Height in dots (e.g. 128 for 16mm at 203 DPI)
2       2      uint16 LE     0x5002 (constant — unknown)
4       2      uint16 LE     0x0054 (constant — unknown)
6       2      uint16 LE     0x0030 = 48 (bytes per row = 384 dots wide)
8       2      uint16 LE     0x0001 (constant)
10      2      uint16 LE     0x0001 (constant)
12      varies              Raw 1-bit bitmap (see below)
12+N    ...    zeros         Padding to fill 32768 bytes
```

### Bitmap encoding
- **Width:** always 384 dots (48 bytes/row) — the full T50M Pro print-head width
- **Height:** dots = `round(mm × 203 / 25.4)` — e.g. 16mm → 128 dots
- **Bit order:** MSB first (bit 7 of byte 0 = leftmost dot)
- **Ink:** `1` = print dot, `0` = blank
- **Row order:** top to bottom

### Label dimensions
- **Width:** 384 dots (48mm full print head) — text is centered
- **Height:** 128 dots (16mm) for the 1.25" × 1.25" bag label
- **Tape:** 25mm tape — text must fit within ~200 center dots to avoid edge cutoff

### LZMA compression
- **Format:** FORMAT_ALONE (the legacy `.lzma` format with 13-byte header)
- **Properties:** `0x5d` (lc=3, lp=0, pb=2 — standard LZMA defaults)
- **Dict size:** 8192 bytes
- **Uncompressed size field:** 32768 (always, written in the LZMA header)
- **Compression:** Python 3's built-in `lzma` module (`FORMAT_ALONE`), invoked via `python3 -c` with **stdin/stdout** (no temp files; avoids concurrent-print races)

---

## Label visual layout

```
┌──────────────────────────────────────┐
│                                      │  384 dots wide (48mm)
│                                      │  (only ~200 center dots on 25mm tape)
│              A1C                     │  ← 62pt bold monospace, centered
│                                      │
│           0.8500 g                   │  ← 26pt monospace, centered
│                                      │
└──────────────────────────────────────┘
              128 dots tall (16mm)
```

---

## Usage

1. Connect T50M Pro via USB-C
2. Run `node label-server.js` in project root
3. Open the web app → Inventory Management → RECENT BAGS
4. Click **Print** on any unsold bag
5. Label prints immediately — no dialog

---

## Error handling

| Error | Message shown | Fix |
|-------|--------------|-----|
| Server not running | Alert with instructions to run `node label-server.js` | Start the server |
| Printer not connected | `T50M Pro not found` | Plug in USB |
| No paper loaded | `Printer not ready (status 0x...)` | Load label tape |
| Server crash | `Print failed: [error]` | Check terminal for details |

---

## Troubleshooting

**`node-hid` can't find the device on macOS:**  
macOS may require granting USB access. Run the server with `sudo node label-server.js` on first use, or add a udev-style IOKit entitlement.

**`canvas` installation fails:**  
Make sure Homebrew packages are installed first: `brew install pkg-config cairo pango libpng jpeg giflib librsvg`

**Label text is cut off on tape edges:**  
The print head is 384 dots (48mm) but 25mm tape only covers ~200 dots. The text in `label-server.js` is centered at `TAPE_WIDTH_DOTS / 2`. If content is clipped, reduce font sizes or narrow the rendered text width.

**Label is too long/short:**  
Adjust `LABEL_HEIGHT_MM` in `label-server.js` (currently `16`). Each 1mm = ~8 dots at 203 DPI.

**Unknown header constants (`0x5002`, `0x0054`):**  
These were captured from real print traffic and kept as-is. They appear to be fixed values in the Katasymbol firmware — changing them may cause the print to fail.
