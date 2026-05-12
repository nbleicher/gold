import JsBarcode from "jsbarcode";

/** DK-2210 continuous tape on Brother QL-600 (29mm / 1.1" wide). */
const LABEL_PROFILE = {
  pageWidthMm: 29,
  paddingMm: 1.5,
  metaFontPx: 6,
  codeFontPx: 8,
  weightFontPx: 7,
  barcodeModuleWidth: 1,
  barcodeHeight: 30
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
        size: ${LABEL_PROFILE.pageWidthMm}mm auto;
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
      }
      .label {
        width: ${LABEL_PROFILE.pageWidthMm}mm;
        max-width: ${LABEL_PROFILE.pageWidthMm}mm;
        padding: ${LABEL_PROFILE.paddingMm}mm;
        box-sizing: border-box;
        page-break-after: avoid;
        break-inside: avoid;
      }
      .meta {
        font-size: ${LABEL_PROFILE.metaFontPx}px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin: 0 0 0.8mm;
        line-height: 1.1;
      }
      .barcode-wrap {
        width: 100%;
        overflow: hidden;
        margin: 0 0 0.8mm;
      }
      .barcode-wrap svg {
        width: 100%;
        height: auto;
        display: block;
      }
      .code {
        font-size: ${LABEL_PROFILE.codeFontPx}px;
        font-weight: 700;
        letter-spacing: 0.04em;
        margin: 0 0 0.4mm;
        line-height: 1.1;
        word-break: break-all;
      }
      .weight {
        font-size: ${LABEL_PROFILE.weightFontPx}px;
        line-height: 1.1;
        margin: 0;
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
      margin: 0,
      width: LABEL_PROFILE.barcodeModuleWidth,
      height: LABEL_PROFILE.barcodeHeight
    });

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
