import JsBarcode from "jsbarcode";

/** DK-2210 continuous tape on Brother QL-600 (29mm / 1.1" wide). */
const LABEL_PROFILE = {
  pageWidthMm: 29,
  minPageHeightMm: 24,
  maxPageHeightMm: 55,
  pageHeightSafetyMm: 0.75,
  paddingTopMm: 2,
  paddingRightMm: 2,
  paddingBottomMm: 2,
  paddingLeftMm: 3.5,
  codeFontPx: 11,
  weightFontPx: 9,
  barcodeHeight: 30,
  barcodeQuietZone: 8,
  barcodeMaxHeightMm: 10
} as const;

export const LABEL_PRINT_SETUP_HINT =
  "Print setup: Brother QL-600, 29mm continuous tape (DK-2210), portrait orientation, scale 100%, default margins, and headers/footers off.";

const LABEL_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>&#8203;</title>
    <style>
      :root {
        color-scheme: light;
      }
      @page {
        margin: 0;
      }
      html,
      body {
        margin: 0;
        padding: 0;
        width: ${LABEL_PROFILE.pageWidthMm}mm;
        background: #fff;
        color: #000;
        font-family: Arial, Helvetica, sans-serif;
      }
      body {
        box-sizing: border-box;
      }
      .label {
        width: 100%;
        box-sizing: border-box;
        padding: ${LABEL_PROFILE.paddingTopMm}mm ${LABEL_PROFILE.paddingRightMm}mm ${LABEL_PROFILE.paddingBottomMm}mm ${LABEL_PROFILE.paddingLeftMm}mm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.8mm;
        page-break-inside: avoid;
        break-inside: avoid;
        text-align: center;
      }
      .barcode-wrap {
        width: 100%;
        line-height: 0;
      }
      .barcode-wrap svg {
        display: block;
        width: 100%;
        max-width: 100%;
        max-height: ${LABEL_PROFILE.barcodeMaxHeightMm}mm;
        height: auto;
        margin: 0 auto;
      }
      .code {
        font-size: ${LABEL_PROFILE.codeFontPx}px;
        font-weight: 700;
        letter-spacing: 0.05em;
        line-height: 1.1;
        margin: 0;
      }
      .weight {
        font-size: ${LABEL_PROFILE.weightFontPx}px;
        line-height: 1.1;
        margin: 0;
      }
      @media print {
        .label,
        .barcode-wrap,
        .code,
        .weight {
          page-break-inside: avoid;
          break-inside: avoid;
          page-break-after: avoid;
          break-after: avoid;
        }
      }
    </style>
  </head>
  <body>
    <main class="label">
      <div class="barcode-wrap"><svg id="bag-barcode" aria-label="Bag barcode"></svg></div>
      <div class="code" id="code"></div>
      <div class="weight" id="weight"></div>
    </main>
  </body>
</html>`;

function pxToMm(px: number): number {
  return (px * 25.4) / 96;
}

function clampPageHeightMm(heightMm: number): number {
  return Math.min(
    LABEL_PROFILE.maxPageHeightMm,
    Math.max(LABEL_PROFILE.minPageHeightMm, heightMm)
  );
}

function measureLabelHeightMm(label: HTMLElement): number {
  const heightPx = Math.max(label.scrollHeight, label.getBoundingClientRect().height);
  return clampPageHeightMm(pxToMm(heightPx) + LABEL_PROFILE.pageHeightSafetyMm);
}

function applyPageSize(doc: Document, iframe: HTMLIFrameElement, pageHeightMm: number): void {
  const pageWidthMm = LABEL_PROFILE.pageWidthMm;
  const pageSize = `${pageWidthMm}mm ${pageHeightMm}mm`;

  let pageStyle = doc.getElementById("label-page-size") as HTMLStyleElement | null;
  if (!pageStyle) {
    pageStyle = doc.createElement("style");
    pageStyle.id = "label-page-size";
    doc.head.appendChild(pageStyle);
  }

  pageStyle.textContent = `
    @page {
      size: ${pageSize};
      margin: 0;
    }
    html,
    body {
      width: ${pageWidthMm}mm;
      height: ${pageHeightMm}mm;
    }
    @media print {
      html,
      body {
        width: ${pageWidthMm}mm;
        height: ${pageHeightMm}mm;
      }
    }
  `;

  iframe.style.width = `${pageWidthMm}mm`;
  iframe.style.height = `${pageHeightMm}mm`;
}

function barcodeModuleWidthForCode(code: string): number {
  const printableWidthMm =
    LABEL_PROFILE.pageWidthMm - LABEL_PROFILE.paddingLeftMm - LABEL_PROFILE.paddingRightMm;
  const estimatedModules = 35 + code.length * 11;
  const target = printableWidthMm / estimatedModules;
  return Math.min(2.2, Math.max(1.5, target));
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
    iframe.style.left = "0";
    iframe.style.top = "0";
    iframe.style.width = `${LABEL_PROFILE.pageWidthMm}mm`;
    iframe.style.height = `${LABEL_PROFILE.minPageHeightMm}mm`;
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const doc = frameWindow?.document;
    if (!frameWindow || !doc) {
      throw new Error("Failed to create print frame.");
    }

    doc.open();
    doc.write(LABEL_HTML);
    doc.close();

    const label = doc.querySelector(".label") as HTMLElement | null;
    const barcodeSvg = doc.getElementById("bag-barcode") as SVGSVGElement | null;
    const codeText = doc.getElementById("code");
    const weightText = doc.getElementById("weight");
    if (!label || !barcodeSvg || !codeText || !weightText) {
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

    const printWhenReady = () => {
      frameWindow.requestAnimationFrame(() => {
        const pageHeightMm = measureLabelHeightMm(label);
        applyPageSize(doc, iframe!, pageHeightMm);
        frameWindow.requestAnimationFrame(() => {
          frameWindow.focus();
          frameWindow.print();
        });
      });
    };

    if (doc.readyState === "complete") {
      printWhenReady();
      return;
    }

    iframe.addEventListener("load", printWhenReady, { once: true });
  } catch (err) {
    cleanup();
    const e = err as Error;
    alert(`Print failed: ${e?.message ?? String(err)}\n\n${LABEL_PRINT_SETUP_HINT}`);
  }
}
