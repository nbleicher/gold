import JsBarcode from "jsbarcode";

/** DK-2210 continuous tape on Brother QL-600 (29mm / 1.1" wide). */
const LABEL_PROFILE = {
  pageWidthMm: 29,
  pageHeightMm: 22,
  paddingTopMm: 2,
  paddingRightMm: 2,
  paddingBottomMm: 2.5,
  paddingLeftMm: 4,
  metaFontPx: 8,
  codeFontPx: 12,
  weightFontPx: 10,
  barcodeHeight: 44,
  barcodeQuietZone: 10
} as const;

export const LABEL_PRINT_SETUP_HINT =
  "In the print dialog, choose Brother QL-600 with 29mm continuous tape (DK-2210).";

const LABEL_HTML = (code: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Bag Label ${escapeHtml(code)}</title>
    <style>
      :root {
        color-scheme: light;
      }
      @page {
        size: ${LABEL_PROFILE.pageWidthMm}mm ${LABEL_PROFILE.pageHeightMm}mm;
        margin: 0;
      }
      html,
      body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #000;
        font-family: Arial, Helvetica, sans-serif;
      }
      body {
        width: ${LABEL_PROFILE.pageWidthMm}mm;
        min-height: ${LABEL_PROFILE.pageHeightMm}mm;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .label {
        width: ${LABEL_PROFILE.pageWidthMm}mm;
        max-width: ${LABEL_PROFILE.pageWidthMm}mm;
        padding: ${LABEL_PROFILE.paddingTopMm}mm ${LABEL_PROFILE.paddingRightMm}mm ${LABEL_PROFILE.paddingBottomMm}mm ${LABEL_PROFILE.paddingLeftMm}mm;
        box-sizing: border-box;
        page-break-after: avoid;
        break-inside: avoid;
        text-align: center;
      }
      .meta {
        font-size: ${LABEL_PROFILE.metaFontPx}px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        margin: 0 0 1mm;
        line-height: 1.15;
      }
      .barcode-wrap {
        width: 100%;
        margin: 0 0 1mm;
      }
      .barcode-wrap svg {
        width: 100%;
        max-width: 100%;
        height: auto;
        display: block;
        margin: 0 auto;
      }
      .code {
        font-size: ${LABEL_PROFILE.codeFontPx}px;
        font-weight: 700;
        letter-spacing: 0.05em;
        margin: 0 0 0.6mm;
        line-height: 1.15;
      }
      .weight {
        font-size: ${LABEL_PROFILE.weightFontPx}px;
        line-height: 1.15;
        margin: 0;
      }
      @media print {
        html,
        body {
          width: ${LABEL_PROFILE.pageWidthMm}mm;
          min-height: ${LABEL_PROFILE.pageHeightMm}mm;
        }
      }
    </style>
  </head>
  <body>
    <main class="label">
      <div class="meta">Bag Sticker</div>
      <div class="barcode-wrap"><svg id="bag-barcode" aria-label="Bag barcode"></svg></div>
      <div class="code" id="code"></div>
      <div class="weight" id="weight"></div>
    </main>
  </body>
</html>`;

function barcodeModuleWidthForCode(code: string): number {
  const printableWidthMm =
    LABEL_PROFILE.pageWidthMm - LABEL_PROFILE.paddingLeftMm - LABEL_PROFILE.paddingRightMm;
  const estimatedModules = 35 + code.length * 11;
  const target = printableWidthMm / estimatedModules;
  return Math.min(2.4, Math.max(1.6, target));
}

/**
 * Print a single bag label via the browser's native print flow.
 * The barcode encodes the bag's existing sticker code.
 */
export function printLabel(stickerCode: string, weightGrams: number): void {
  const code = String(stickerCode ?? "").trim();
  const w = Number(weightGrams);

  if (!code) {
    alert("Cannot print: missing sticker code.");
    return;
  }
  if (!Number.isFinite(w) || w <= 0) {
    alert("Cannot print: weight must be a positive number.");
    return;
  }

  let iframe: HTMLIFrameElement | null = null;
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    iframe?.remove();
    iframe = null;
  };

  try {
    iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.style.position = "fixed";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const doc = frameWindow?.document;
    if (!frameWindow || !doc) {
      throw new Error("Failed to create print frame.");
    }

    doc.open();
    doc.write(LABEL_HTML(code));
    doc.close();

    const barcodeSvg = doc.getElementById("bag-barcode") as SVGSVGElement | null;
    const codeText = doc.getElementById("code");
    const weightText = doc.getElementById("weight");
    if (!barcodeSvg || !codeText || !weightText) {
      throw new Error("Failed to create print layout.");
    }

    JsBarcode(barcodeSvg, code, {
      format: "CODE128",
      displayValue: false,
      lineColor: "#000000",
      margin: LABEL_PROFILE.barcodeQuietZone,
      width: barcodeModuleWidthForCode(code),
      height: LABEL_PROFILE.barcodeHeight
    });

    barcodeSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    codeText.textContent = code;
    weightText.textContent = `${w.toFixed(4)} g`;

    frameWindow.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 60_000);

    const print = () => {
      frameWindow.focus();
      frameWindow.print();
    };

    if (doc.readyState === "complete") {
      print();
      return;
    }

    iframe.addEventListener("load", print, { once: true });
  } catch (err) {
    cleanup();
    const e = err as Error;
    alert(`Print failed: ${e?.message ?? String(err)}\n\n${LABEL_PRINT_SETUP_HINT}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
