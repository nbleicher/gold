export function printLabel(stickerCode: string, weightGrams: number): void {
  const formattedWeight = Number(weightGrams).toFixed(4) + " g";

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Print Label</title>
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
      html, body {
        width: 22mm;
        height: 13mm;
      }
      body {
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
</html>`;

  const popup = window.open("", "_blank", "width=200,height=150");
  if (!popup) {
    alert("Please allow popups for this site to print labels.");
    return;
  }

  let hasPrinted = false;
  let closeTimer: number | undefined;
  const cleanup = () => {
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  };
  const safeClose = () => {
    cleanup();
    if (!popup.closed) popup.close();
  };
  const runPrint = () => {
    if (hasPrinted) return;
    hasPrinted = true;

    popup.focus();
    popup.print();

    // Some browsers miss afterprint for popup windows.
    closeTimer = window.setTimeout(safeClose, 1500);
  };

  popup.addEventListener("afterprint", safeClose);

  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  } catch (error) {
    safeClose();
    alert(`Unable to prepare label for printing: ${(error as Error).message}`);
    return;
  }

  // Trigger print when content is ready.
  popup.addEventListener("load", runPrint, { once: true });

  // Fallback in case load doesn't reliably fire for injected popup docs.
  window.setTimeout(runPrint, 250);
}
