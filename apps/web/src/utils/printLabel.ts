const LABEL_SERVER = "http://127.0.0.1:4242";

/**
 * Send a print job to the local label-server.js bridge, which talks to the
 * Katasymbol T50M Pro over USB HID.
 *
 * Prerequisites:
 *   1. label-server.js is running (`node label-server.js` from project root)
 *   2. The T50M Pro is connected via USB
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
    const res = await fetch(`${LABEL_SERVER}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stickerCode: code, weightGrams: w }),
    });

    if (!res.ok) {
      const message = await readErrorBody(res);
      throw new Error(message);
    }
  } catch (err) {
    const e = err as Error;
    const msg = e?.message ?? String(err);

    // Connection refused / blocked = label-server not reachable
    if (
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("Load failed")
    ) {
      alert(
        "Label server is not running or the browser blocked the request.\n\n" +
          "1. Open a terminal in the project root and run:\n\n" +
          "       node label-server.js\n\n" +
          "2. If the site is HTTPS, allow localhost or use HTTP for dev.\n" +
          "3. Keep the T50M Pro connected via USB."
      );
      return;
    }

    alert(`Print failed: ${msg}`);
  }
}

async function readErrorBody(res: Response): Promise<string> {
  const status = `HTTP ${res.status}`;
  const ct = res.headers.get("content-type") ?? "";

  if (ct.includes("application/json")) {
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body?.error === "string" && body.error.trim()) {
        return body.error.trim();
      }
    } catch {
      /* fall through */
    }
    return status;
  }

  if (res.status === 404) {
    return "Label server returned 404 — wrong URL or old server. Restart with: node label-server.js";
  }

  try {
    const text = (await res.text()).trim();
    if (text) {
      return text.length > 240 ? `${text.slice(0, 240)}…` : text;
    }
  } catch {
    /* ignore */
  }

  return res.statusText ? `${status}: ${res.statusText}` : status;
}
