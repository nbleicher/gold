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
  try {
    const res = await fetch(`${LABEL_SERVER}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stickerCode, weightGrams: Number(weightGrams) }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Server error ${res.status}`);
    }
  } catch (err) {
    const msg = (err as Error).message;

    // Connection refused = label-server.js is not running
    if (msg.includes("Failed to fetch") || msg.includes("ECONNREFUSED")) {
      alert(
        "Label server is not running.\n\n" +
        "Open a terminal in the project root and run:\n\n" +
        "    node label-server.js\n\n" +
        "Make sure the T50M Pro is also connected via USB."
      );
      return;
    }

    alert(`Print failed: ${msg}`);
  }
}
