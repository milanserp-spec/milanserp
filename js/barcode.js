/* =========================================================
   FoodERP Lite — Barcode / QR helpers
   Thin wrapper around the vendored JsBarcode + QRCode
   libraries (js/vendor/) so the rest of the app doesn't need
   to know their individual APIs. Works fully offline since
   both libraries are bundled locally, not loaded from a CDN.
   ========================================================= */

/** Renders a scannable barcode into a <canvas> or <svg> element.
 *  format: "CODE128" (default, works for any text/number) or "EAN13" (needs exactly 12-13 digits). */
function renderBarcode(el, value, format) {
  if (!value) { el.replaceChildren(); return false; }
  try {
    JsBarcode(el, value, {
      format: format || "CODE128",
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 14,
      margin: 6,
    });
    return true;
  } catch (err) {
    // e.g. EAN13 needs a valid check digit / length — fall back to CODE128
    if (format === "EAN13") {
      return renderBarcode(el, value, "CODE128");
    }
    return false;
  }
}

/** Renders a QR code into a <canvas> element. Returns a Promise. */
function renderQR(canvasEl, value) {
  return new Promise((resolve, reject) => {
    if (!value) { resolve(false); return; }
    QRCode.toCanvas(canvasEl, value, { width: 120, margin: 1 }, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
}

/** Generates a barcode value for a product if it doesn't have one — a simple
 *  internal Code128-friendly code derived from the product id + code. */
function generateBarcodeValue(product) {
  const base = (product.code || "").replace(/[^A-Za-z0-9]/g, "");
  return base || String(product.id).padStart(6, "0");
}
