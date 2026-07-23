/* =========================================================
   FoodERP Lite — Bluetooth (BLE) ESC/POS Printing
   =========================================================
   IMPORTANT — REAL-WORLD LIMITS (read before relying on this):
   1. This uses the Web BLUETOOTH API, which only talks to
      Bluetooth LOW ENERGY (BLE) devices. Many cheap 58mm/80mm
      "Bluetooth thermal printers" actually use classic
      Bluetooth SPP (Serial Port Profile), which Web Bluetooth
      CANNOT reach at all. Check your printer's spec sheet —
      if it says "BLE" or "BT 4.0/5.0 LE" it should work here;
      if it only says "Bluetooth 2.0/3.0" it will not.
   2. Web Bluetooth is supported in Chrome/Edge on Android and
      on desktop. It is NOT supported in Safari/iOS at all, and
      is NOT available inside a plain Capacitor WebView without
      an extra native plugin — that native bridging is planned
      for Phase 8 (APK packaging) so this same UI keeps working.
   3. Because printer hardware varies, this module tries a
      handful of common ESC/POS-over-BLE service/characteristic
      combinations rather than one fixed UUID. If your printer
      isn't found, "Print Test" will explain that clearly.
   ========================================================= */

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

/** Candidate (service, writable characteristic) UUID pairs seen on common
 *  generic ESC/POS BLE thermal printers. We try each in turn. */
const PRINTER_PROFILES = [
  { service: "000018f0-0000-1000-8000-00805f9b34fb", write: "00002af1-0000-1000-8000-00805f9b34fb" },
  { service: "0000ff00-0000-1000-8000-00805f9b34fb", write: "0000ff02-0000-1000-8000-00805f9b34fb" },
  { service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e", write: "6e400002-b5a3-f393-e0a9-e50e24dcca9e" }, // Nordic UART
  { service: "49535343-fe7d-4ae5-8fa9-9fafd205e455", write: "49535343-8841-43f4-a8d4-ecbe34729bb3" }, // ISSC UART
];

const ALL_SERVICE_UUIDS = PRINTER_PROFILES.map((p) => p.service);

let connectedDevice = null;
let connectedCharacteristic = null;

function isBluetoothSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

/** Opens the OS Bluetooth device picker and connects. Must be called from a user gesture (button click). */
async function connectPrinter() {
  if (!isBluetoothSupported()) {
    throw new Error("Bluetooth isn't available in this browser. Use Chrome/Edge on Android, or Chrome on desktop.");
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ALL_SERVICE_UUIDS,
  });

  const server = await device.gatt.connect();

  let foundChar = null;
  for (const profile of PRINTER_PROFILES) {
    try {
      const service = await server.getPrimaryService(profile.service);
      const characteristic = await service.getCharacteristic(profile.write);
      foundChar = characteristic;
      break;
    } catch (e) {
      // this profile didn't match — try the next one
    }
  }

  // Fallback: if none of our known profiles matched, look through whatever
  // services the OS exposed for any characteristic that supports writing.
  if (!foundChar) {
    try {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        const chars = await service.getCharacteristics();
        const writable = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
        if (writable) { foundChar = writable; break; }
      }
    } catch (e) { /* ignore */ }
  }

  if (!foundChar) {
    device.gatt.disconnect();
    throw new Error("Connected to the device, but couldn't find a printable channel. This model may not be BLE-ESC/POS compatible.");
  }

  connectedDevice = device;
  connectedCharacteristic = foundChar;

  device.addEventListener("gattserverdisconnected", () => {
    connectedDevice = null;
    connectedCharacteristic = null;
  });

  await savePrinterInfo(device.name || "Unnamed printer", device.id);
  return { name: device.name || "Unnamed printer", id: device.id };
}

function disconnectPrinter() {
  if (connectedDevice && connectedDevice.gatt.connected) {
    connectedDevice.gatt.disconnect();
  }
  connectedDevice = null;
  connectedCharacteristic = null;
}

function isPrinterConnected() {
  return !!(connectedDevice && connectedDevice.gatt.connected && connectedCharacteristic);
}

async function savePrinterInfo(name, deviceId) {
  await DB.add("printer", { type: "bluetooth", name, deviceId, connectedAt: Date.now() });
}

async function getLastPrinterInfo() {
  const all = await DB.getAll("printer");
  if (all.length === 0) return null;
  return all.sort((a, b) => b.connectedAt - a.connectedAt)[0];
}

/** Sends raw bytes in small chunks — BLE characteristics often can't take large writes at once. */
async function writeBytes(bytes) {
  if (!isPrinterConnected()) throw new Error("No printer connected.");
  const CHUNK = 100;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.slice(i, i + CHUNK);
    if (connectedCharacteristic.properties.writeWithoutResponse) {
      await connectedCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await connectedCharacteristic.writeValue(chunk);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Builds ESC/POS byte commands from a simple line-based description.
 *  lines: array of { text, align: 'left'|'center'|'right', bold, size: 'normal'|'double', feed } */
function buildEscPos(lines) {
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const pushText = (str) => {
    const encoded = new TextEncoder().encode(str.replace(/₹/g, "Rs."));
    push(...encoded);
  };

  push(ESC, 0x40); // initialize

  lines.forEach((line) => {
    if (line.divider) {
      push(ESC, 0x61, 0x01); // center
      pushText("-".repeat(32));
      push(LF);
      return;
    }
    push(ESC, 0x61, line.align === "center" ? 0x01 : line.align === "right" ? 0x02 : 0x00);
    push(ESC, 0x45, line.bold ? 0x01 : 0x00);
    push(GS, 0x21, line.size === "double" ? 0x11 : 0x00);
    pushText(line.text || "");
    push(LF);
  });

  push(LF, LF, LF);
  push(GS, 0x56, 0x00); // cut (ignored harmlessly by printers without a cutter)
  return new Uint8Array(bytes);
}

/** High-level: print a sale receipt. `sale` = { invoiceNo, date, customerName, items, subtotal, gst, discount, total, payment, companyName } */
async function printReceipt(sale) {
  const lines = [
    { text: sale.companyName || "My Food Business", align: "center", bold: true, size: "double" },
    { text: "Invoice: " + sale.invoiceNo, align: "center" },
    { text: new Date(sale.date).toLocaleString("en-IN"), align: "center" },
    { divider: true },
    { text: "Customer: " + sale.customerName, align: "left" },
    { divider: true },
    ...sale.items.map((i) => ({ text: `${i.name} x${i.qty}  Rs.${(i.price * i.qty).toFixed(2)}`, align: "left" })),
    { divider: true },
    { text: `Subtotal: Rs.${sale.subtotal.toFixed(2)}`, align: "right" },
    { text: `GST: Rs.${sale.gst.toFixed(2)}`, align: "right" },
    { text: `Discount: -Rs.${sale.discount.toFixed(2)}`, align: "right" },
    { text: `TOTAL: Rs.${sale.total.toFixed(2)}`, align: "right", bold: true, size: "double" },
    { divider: true },
    { text: "Payment: " + sale.payment, align: "left" },
    { text: "Thank you!", align: "center" },
  ];
  await writeBytes(buildEscPos(lines));
}

/** High-level: print a small product label. `label` = { name, batch, mrp, mfgDate, expiryDate, show }
 *  `show` = { name, batch, mrp, mfgDate, expiryDate } booleans — any left out default to true. */
async function printLabel(label) {
  const show = Object.assign({ name: true, batch: true, mrp: true, mfgDate: true, expiryDate: true }, label.show || {});
  const lines = [];
  if (show.name) lines.push({ text: label.name, align: "center", bold: true });
  if (show.batch) lines.push({ text: "Batch: " + (label.batch || "—"), align: "center" });
  if (show.mrp) lines.push({ text: "MRP: Rs." + Number(label.mrp || 0).toFixed(2), align: "center", bold: true });
  if (show.mfgDate) lines.push({ text: "Mfg: " + label.mfgDate, align: "center" });
  if (show.expiryDate) lines.push({ text: "Exp: " + label.expiryDate, align: "center" });
  if (lines.length === 0) lines.push({ text: "(no fields selected)", align: "center" });
  await writeBytes(buildEscPos(lines));
}

async function printTest() {
  await writeBytes(buildEscPos([
    { text: "FoodERP Lite", align: "center", bold: true, size: "double" },
    { text: "Printer Test", align: "center" },
    { divider: true },
    { text: "If you can read this,", align: "left" },
    { text: "your printer is connected!", align: "left" },
  ]));
}
