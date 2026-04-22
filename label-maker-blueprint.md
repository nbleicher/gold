# Label Maker Integration — Implementation Blueprint

**Project:** Gold Inventory Platform  
**Printer:** Katasymbol T50M Pro (25mm tape)  
**Label Size:** 25mm × 16mm (fits on 1.25" × 1.25" dime bag, ~3mm margin each side)  
**Trigger:** Manual "Print Label" button per bag order row  
**Data printed:** Sticker code + weight in grams  

---

## Files Changed

```
apps/web/src/
├── utils/
│   └── printLabel.ts          ← NEW
├── pages/
│   └── OrdersPage.tsx         ← MODIFY (add Print button to each row)
```

No backend changes. No new npm packages. No database changes.

---

## 1. `apps/web/src/utils/printLabel.ts` — New File

### Purpose

Opens a hidden browser popup, injects a print-ready HTML document sized to the label dimensions, triggers the OS print dialog, then closes the popup.

### Function Signature

```ts
export function printLabel(stickerCode: string, weightGrams: number): void
```

### Label Layout

```
┌─────────────────────────┐
│                         │  25mm wide
│          A1C            │  ← Sticker code — 18pt bold monospace, centered
│        0.8500 g         │  ← Weight — 9pt, centered, always 4 decimal places
│                         │
└─────────────────────────┘
          16mm tall
```

### Implementation

```ts
export function printLabel(stickerCode: string, weightGrams: number): void {
  const formattedWeight = weightGrams.toFixed(4) + ' g';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          @page {
            size: 25mm 16mm;
            margin: 1.5mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            width: 22mm;
            height: 13mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .sticker-code {
            font-family: monospace;
            font-size: 18pt;
            font-weight: bold;
            line-height: 1;
            letter-spacing: 0.05em;
          }
          .weight {
            font-family: monospace;
            font-size: 9pt;
            margin-top: 1mm;
          }
        </style>
      </head>
      <body>
        <div class="sticker-code">${stickerCode}</div>
        <div class="weight">${formattedWeight}</div>
      </body>
    </html>
  `;

  const popup = window.open('', '_blank', 'width=200,height=150');
  if (!popup) {
    alert('Please allow popups for this site to print labels.');
    return;
  }

  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
  popup.close();
}
```

### Weight Formatting Examples

| Stored value | Printed as  |
|--------------|-------------|
| `0.85`       | `0.8500 g`  |
| `1.2`        | `1.2000 g`  |
| `0.1234`     | `0.1234 g`  |
| `2.001`      | `2.0010 g`  |

---

## 2. `apps/web/src/pages/OrdersPage.tsx` — Modifications

### Where to Add

In the existing bag orders table, each row already renders: sticker code, metal, weight, tier, created date, sold status, and a delete button. Add a Print button at the end of each row, after the existing action buttons.

### Import to Add

```ts
import { printLabel } from '../utils/printLabel';
```

### Button to Add in Each Row

```tsx
{!order.sold_at && (
  <button
    onClick={() => printLabel(order.sticker_code, order.actual_weight_grams)}
    className="btn-print"
    title="Print label"
  >
    🖨 Print
  </button>
)}
```

### Rules

- Only shown on **unsold** bags — sold bags don't need new labels
- All data needed (`sticker_code`, `actual_weight_grams`) already exists in the component via the existing `useQuery` fetch — no API call required
- Style the button to match existing action buttons in OrdersPage

---

## 3. One-Time Printer Setup (not code)

This must be done once per machine before printing works.

1. **Pair the printer** — macOS System Preferences → Printers & Scanners → Add Printer → select T50M Pro via Bluetooth or USB
2. **Create a custom paper size** in the print dialog:
   - Width: `25mm`
   - Height: `16mm`
   - All margins: `0mm` (the CSS handles margins internally)
   - Save as: `"Gold Label 25x16"`
3. **First print test** — click Print Label on any bag, select T50M Pro in the dialog, choose `"Gold Label 25x16"`, scale at `100%`
4. **Set as default** — once confirmed, the browser will remember the last-used settings for that printer

---

## 4. Implementation Sequence

| Step | Action | File |
|------|--------|------|
| 1 | Create `printLabel.ts` with full HTML/CSS popup logic | `utils/printLabel.ts` |
| 2 | Test layout in browser console: `printLabel('A1C', 0.85)` | — |
| 3 | Do a real test print, check sizing against the bag | — |
| 4 | Adjust `@page` dimensions if needed (±1–2mm) | `utils/printLabel.ts` |
| 5 | Add import + Print button to `OrdersPage.tsx` | `pages/OrdersPage.tsx` |
| 6 | Confirm button only appears on unsold bags | — |

---

## 5. What This Does Not Require

- No backend changes (zero API modifications)
- No new npm packages (pure browser APIs only)
- No barcode or QR code generation (sticker code is short and human-readable)
- No database schema changes (all required fields already exist)
- No custom printer driver or native binary

---

## 6. Edge Cases to Handle

| Case | Handling |
|------|----------|
| Browser blocks popup | Show `alert()` instructing user to allow popups for this site |
| Sticker code is long (e.g., "A13AA") | Monospace font + `letter-spacing` keeps it readable; test at max length |
| Weight is whole number (e.g., `1`) | `.toFixed(4)` always pads to 4 decimals → `1.0000 g` |
| User cancels print dialog | Popup closes naturally; no side effects |
| Printer not set up as system printer | OS print dialog simply won't show it; user must complete one-time setup |
