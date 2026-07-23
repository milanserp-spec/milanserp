/* =========================================================
   FoodERP Lite — Camera Barcode/QR Scanning
   =========================================================
   Uses the native BarcodeDetector API (built into Chrome/Edge
   on Android and desktop — no extra library needed, works
   offline once the page is loaded). NOT available in Safari/
   iOS as of this build — openScanner() detects that and tells
   the caller so the UI can fall back to typing the code in
   manually (every screen that uses this already has a text
   search box as a fallback).

   USB barcode scanners need no special code at all: they act
   like a keyboard, "typing" the barcode followed by Enter into
   whatever text field is focused — so the existing search /
   barcode input boxes already work with a USB scanner plugged in.
   ========================================================= */

function isScannerSupported() {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/** Opens a full-screen camera modal, resolves with the first decoded value.
 *  Resolves with null if the user cancels. Rejects if the camera/API is unavailable. */
function openScanner() {
  return new Promise((resolve, reject) => {
    if (!isScannerSupported()) {
      reject(new Error("Camera scanning needs Chrome or Edge (Android or desktop). Type the barcode instead."));
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.zIndex = "200";
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:420px; padding:16px; text-align:center;">
        <h2 style="margin-bottom:10px;">Scan Barcode</h2>
        <video id="scannerVideo" autoplay playsinline muted style="width:100%; border-radius:12px; background:#000;"></video>
        <p style="font-size:var(--fs-xs); color:var(--color-text-muted); margin:10px 0;">Point the camera at a barcode or QR code</p>
        <button type="button" class="btn btn-ghost" id="scannerCancelBtn">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);

    const video = overlay.querySelector("#scannerVideo");
    let stream = null;
    let stopped = false;

    function cleanup(result) {
      if (stopped) return;
      stopped = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      overlay.remove();
      resolve(result);
    }

    overlay.querySelector("#scannerCancelBtn").addEventListener("click", () => cleanup(null));

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        const detector = new BarcodeDetector({ formats: ["code_128", "ean_13", "ean_8", "qr_code", "upc_a", "upc_e"] });

        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0) {
              cleanup(codes[0].rawValue);
              return;
            }
          } catch (e) { /* keep trying */ }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
      .catch((err) => {
        overlay.remove();
        reject(new Error("Couldn't access the camera: " + err.message));
      });
  });
}
