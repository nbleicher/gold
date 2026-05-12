import JsBarcode from "jsbarcode";

/**
 * Print a single bag label via the browser's native print flow.
 * The barcode encodes the bag's existing sticker code.
 */
export async function printLabel(stickerCode: string, weightGrams: number): Promise<void> {
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

  try {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=420,height=640");
    if (!popup) {
      alert("Print window was blocked. Allow pop-ups for this site and try again.");
      return;
    }

    const doc = popup.document;
    doc.open();
    doc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Bag Label ${escapeHtml(code)}</title>
    <style>
      :root {
        color-scheme: light;
      }
      @page {
        margin: 0.12in;
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
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }
      .label {
        width: 3.0in;
        border: 1px solid #000;
        border-radius: 3px;
        padding: 0.1in 0.1in 0.08in;
        box-sizing: border-box;
      }
      .meta {
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 0.06in;
      }
      .barcode-wrap {
        width: 100%;
        overflow: hidden;
        margin-bottom: 0.05in;
      }
      .barcode-wrap svg {
        width: 100%;
        height: auto;
        display: block;
      }
      .code {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.08em;
        margin-bottom: 0.02in;
      }
      .weight {
        font-size: 12px;
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
</html>`);
    doc.close();

    const barcodeSvg = doc.getElementById("bag-barcode") as SVGSVGElement | null;
    const codeText = doc.getElementById("code");
    const weightText = doc.getElementById("weight");
    if (!barcodeSvg || !codeText || !weightText) {
      popup.close();
      throw new Error("Failed to create print layout.");
    }

    JsBarcode(barcodeSvg, code, {
      format: "CODE128",
      displayValue: false,
      lineColor: "#000000",
      margin: 0,
      width: 2,
      height: 70
    });

    codeText.textContent = code;
    weightText.textContent = `${w.toFixed(4)} g`;

    window.setTimeout(() => {
      popup.focus();
      popup.print();
    }, 40);
  } catch (err) {
    const e = err as Error;
    alert(`Print failed: ${e?.message ?? String(err)}`);
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
