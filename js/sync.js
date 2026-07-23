/* =========================================================
   FoodERP Lite — Supabase Sync
   =========================================================
   Two-way sync against a Supabase Postgres database (via its
   built-in REST API — no server code to write or redeploy).
   Replaces the earlier Google Apps Script version, which had
   to be manually redeployed every time its code changed and
   gave little visibility when something failed.

   STILL NOT INSTANT. There's no way for Supabase to notify a
   phone the moment something changes without a persistent
   connection (out of scope here) — sync happens on a ~60s
   timer while online, or immediately via "Sync Now".

   CONFLICTS: last device to sync a given record wins — no
   field-by-field merging. Matters most for stock counts; sync
   often and avoid billing the same item on two devices at once.
   ========================================================= */

/** Tables that sync, and how their JS field names map to the
 *  snake_case columns created by sync/schema.sql. Fields not
 *  listed here (e.g. local numeric ids like supplierId) stay
 *  device-local and are never pushed — those numeric ids only
 *  make sense on the device that created them. */
const FIELD_MAPS = {
  categories: { uid: "uid", id: "local_id", name: "name", description: "description", status: "status", createdAt: "created_at", updatedAt: "updated_at" },
  suppliers:  { uid: "uid", id: "local_id", name: "name", contactPerson: "contact_person", phone: "phone", email: "email", gstNo: "gst_no", address: "address", createdAt: "created_at", updatedAt: "updated_at" },
  customers:  { uid: "uid", id: "local_id", name: "name", phone: "phone", type: "type", gstNo: "gst_no", creditLimit: "credit_limit", address: "address", createdAt: "created_at", updatedAt: "updated_at" },
  products:   { uid: "uid", id: "local_id", code: "code", name: "name", category: "category", unit: "unit", weight: "weight", hsn: "hsn", gst: "gst", mrp: "mrp", sellingPrice: "selling_price", barcode: "barcode", manufacturingDays: "manufacturing_days", expiryDays: "expiry_days", stock: "stock", reorderLevel: "reorder_level", status: "status", image: "image", batchAbbrev: "batch_abbrev", lastBatchSerial: "last_batch_serial", createdAt: "created_at", updatedAt: "updated_at" },
  purchase:   { uid: "uid", id: "local_id", supplierUid: "supplier_uid", invoiceNo: "invoice_no", date: "date", itemCount: "item_count", subtotal: "subtotal", gstTotal: "gst_total", total: "total", createdAt: "created_at" },
  production: { uid: "uid", id: "local_id", productUid: "product_uid", batch: "batch", quantity: "quantity", mfgDate: "mfg_date", expiryDate: "expiry_date", operatorName: "operator_name", date: "date" },
  sales:      { uid: "uid", id: "local_id", invoiceNo: "invoice_no", date: "date", customerUid: "customer_uid", customerName: "customer_name", subtotal: "subtotal", gst: "gst", discount: "discount", total: "total", payment: "payment", operatorName: "operator_name", createdAt: "created_at" },
};

/** For tables that reference another synced record — resolves the local
 *  numeric id (e.g. productId) via a *Uid field when pulling data down,
 *  so reports/lists that look records up by local id keep working. */
const FK_MAPS = {
  purchase:   { localField: "supplierId", uidField: "supplierUid", table: "suppliers" },
  production: { localField: "productId", uidField: "productUid", table: "products" },
  sales:      { localField: "customerId", uidField: "customerUid", table: "customers" },
};

function toRow(table, record) {
  const map = FIELD_MAPS[table];
  const row = {};
  for (const [jsKey, col] of Object.entries(map)) {
    if (record[jsKey] !== undefined) row[col] = record[jsKey];
  }
  return row;
}

function fromRow(table, row) {
  const map = FIELD_MAPS[table];
  const record = {};
  for (const [jsKey, col] of Object.entries(map)) {
    if (row[col] !== undefined) record[jsKey] = row[col];
  }
  return record;
}

async function getSyncSettings() {
  const urlRec = await DB.get("settings", "supabaseUrl");
  const keyRec = await DB.get("settings", "supabaseKey");
  const autoRec = await DB.get("settings", "autoSyncEnabled");
  return {
    url: urlRec ? urlRec.value : "",
    key: keyRec ? keyRec.value : "",
    autoEnabled: autoRec ? autoRec.value : false,
  };
}

async function setSupabaseConfig(url, key) {
  await DB.put("settings", { key: "supabaseUrl", value: cleanUrl(url) });
  await DB.put("settings", { key: "supabaseKey", value: (key || "").trim() });
}

async function setAutoSyncEnabled(enabled) {
  await DB.put("settings", { key: "autoSyncEnabled", value: enabled });
}

function cleanUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

function restHeaders(key, extra) {
  return Object.assign({
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  }, extra || {});
}

/** Checks the connection AND that the schema has actually been created. */
async function testSyncConnection(url, key) {
  url = cleanUrl(url);
  key = (key || "").trim();
  const res = await fetch(`${url}/rest/v1/categories?select=uid&limit=1`, {
    headers: restHeaders(key),
  });
  if (res.status === 404 || res.status === 400) {
    throw new Error("Connected to Supabase, but the tables don't exist yet — run sync/schema.sql in the SQL Editor first.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Server responded with status " + res.status + (text ? ": " + text.slice(0, 150) : ""));
  }
  return true;
}

async function pushRecord(url, key, table, row) {
  url = cleanUrl(url);
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=uid`, {
    method: "POST",
    headers: restHeaders(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Push failed (" + res.status + ")" + (text ? ": " + text.slice(0, 150) : ""));
  }
  return true;
}

const MAX_RETRIES = 5;

/** Pushes everything currently pending in the local sync queue. */
async function runSync(onProgress) {
  const { url: rawUrl, key } = await getSyncSettings();
  const url = cleanUrl(rawUrl);
  if (!url || !key) throw new Error("Supabase isn't set up yet — add your Project URL and key first.");
  if (!navigator.onLine) throw new Error("No internet connection right now.");

  const queue = await DB.getAll("sync_queue");
  const pending = queue.filter((q) => q.status === "pending" || q.status === "error");

  let succeeded = 0, failed = 0;

  for (const item of pending) {
    try {
      const record = await DB.get(item.table, item.recordId);
      if (!record) {
        await DB.put("sync_queue", { ...item, status: "done", syncedAt: Date.now() });
        succeeded++;
      } else {
        const row = toRow(item.table, record);
        await pushRecord(url, key, item.table, row);
        await DB.put("sync_queue", { ...item, status: "done", syncedAt: Date.now() });
        succeeded++;
      }
    } catch (err) {
      const retryCount = (item.retryCount || 0) + 1;
      await DB.put("sync_queue", {
        ...item, status: retryCount >= MAX_RETRIES ? "failed" : "error",
        retryCount, lastError: err.message,
      });
      failed++;
    }
    if (onProgress) onProgress({ done: succeeded + failed, total: pending.length });
  }

  return { succeeded, failed, total: pending.length };
}

/** Pulls the latest rows for every synced table and merges them into
 *  local IndexedDB, matched by "uid" — so changes made on OTHER devices
 *  show up here too. Local records still waiting in the pending queue are
 *  left untouched (an unsynced local edit shouldn't be overwritten by an
 *  older remote copy). */
async function pullSync(onProgress) {
  const { url: rawUrl, key } = await getSyncSettings();
  const url = cleanUrl(rawUrl);
  if (!url || !key) throw new Error("Supabase isn't set up yet — add your Project URL and key first.");
  if (!navigator.onLine) throw new Error("No internet connection right now.");

  const pendingQueue = await DB.getAll("sync_queue");
  const pendingUidsByTable = {};
  for (const item of pendingQueue) {
    if (item.status === "pending" || item.status === "error") {
      const localRecord = await DB.get(item.table, item.recordId).catch(() => null);
      if (localRecord && localRecord.uid) {
        (pendingUidsByTable[item.table] = pendingUidsByTable[item.table] || new Set()).add(localRecord.uid);
      }
    }
  }

  let updated = 0, created = 0, skipped = 0;

  for (const table of Object.keys(FIELD_MAPS)) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, { headers: restHeaders(key) });
    if (!res.ok) { if (onProgress) onProgress({ table, error: true }); continue; }
    const rows = await res.json();
    const pendingUids = pendingUidsByTable[table] || new Set();

    for (const row of rows) {
      const remoteRecord = fromRow(table, row);
      if (!remoteRecord.uid) continue;
      if (pendingUids.has(remoteRecord.uid)) { skipped++; continue; }

      const fk = FK_MAPS[table];
      if (fk && remoteRecord[fk.uidField]) {
        const matches = await DB.getByIndex(fk.table, "uid", remoteRecord[fk.uidField]);
        if (matches && matches[0]) remoteRecord[fk.localField] = matches[0].id;
      }

      const existingMatches = await DB.getByIndex(table, "uid", remoteRecord.uid);
      const existing = existingMatches && existingMatches[0];

      const merged = existing ? { ...existing, ...remoteRecord, id: existing.id } : { ...remoteRecord };
      if (!existing) delete merged.id;

      await DB.put(table, merged);
      existing ? updated++ : created++;
    }
    if (onProgress) onProgress({ table });
  }

  return { updated, created, skipped };
}

/** Push local changes up, then pull the latest down — in that order, so
 *  your own just-made edits reach the database before a pull runs and
 *  can't be overwritten by older data. */
async function runFullSync(onProgress) {
  const pushResult = await runSync((p) => onProgress && onProgress({ phase: "push", ...p }));
  const pullResult = await pullSync((p) => onProgress && onProgress({ phase: "pull", ...p }));
  return { push: pushResult, pull: pullResult };
}

let autoSyncTimer = null;

async function startAutoSync() {
  const { autoEnabled } = await getSyncSettings();
  if (!autoEnabled) return;

  const trigger = () => { runFullSync().catch(() => {}); };

  trigger();
  window.addEventListener("online", trigger);
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  autoSyncTimer = setInterval(trigger, 60000);
}
