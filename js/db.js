/* =========================================================
   FoodERP Lite — IndexedDB Database Layer
   Phase 1: schema + open/seed logic. All later modules
   (Product, Sales, Purchase, etc.) read/write through here.
   ========================================================= */

const DB_NAME = "FoodERPDB";
const DB_VERSION = 2;

/** Tables that participate in Google Sheets sync — these get a "uid" field
 *  (globally unique, not the same as the local autoincrement "id") so that
 *  records created independently on different devices never collide when
 *  they're upserted into the same Sheet, and so pulled-down records can be
 *  matched back to the right local row instead of creating duplicates. */
const SYNCABLE_TABLES = ["categories", "suppliers", "customers", "products", "purchase", "production", "sales"];

/** Object store definitions: name -> {keyPath, autoIncrement, indexes:[[name, keyPath, {unique}]]} */
const STORES = {
  users:          { keyPath: "id", autoIncrement: true, indexes: [["type", "type"], ["pin", "pin"], ["username", "username", { unique: true }]] },
  categories:     { keyPath: "id", autoIncrement: true, indexes: [["name", "name"], ["uid", "uid"]] },
  products:       { keyPath: "id", autoIncrement: true, indexes: [["code", "code", { unique: true }], ["name", "name"], ["category", "category"], ["barcode", "barcode"], ["uid", "uid"]] },
  customers:      { keyPath: "id", autoIncrement: true, indexes: [["name", "name"], ["type", "type"], ["uid", "uid"]] },
  suppliers:      { keyPath: "id", autoIncrement: true, indexes: [["name", "name"], ["uid", "uid"]] },
  inventory:      { keyPath: "id", autoIncrement: true, indexes: [["productId", "productId"]] },
  purchase:       { keyPath: "id", autoIncrement: true, indexes: [["supplierId", "supplierId"], ["date", "date"], ["uid", "uid"]] },
  purchase_items: { keyPath: "id", autoIncrement: true, indexes: [["purchaseId", "purchaseId"], ["productId", "productId"]] },
  sales:          { keyPath: "id", autoIncrement: true, indexes: [["customerId", "customerId"], ["date", "date"], ["synced", "synced"], ["uid", "uid"]] },
  sale_items:     { keyPath: "id", autoIncrement: true, indexes: [["saleId", "saleId"], ["productId", "productId"]] },
  production:     { keyPath: "id", autoIncrement: true, indexes: [["productId", "productId"], ["batch", "batch"], ["date", "date"], ["uid", "uid"]] },
  payments:       { keyPath: "id", autoIncrement: true, indexes: [["refType", "refType"], ["refId", "refId"]] },
  settings:       { keyPath: "key" },
  sync_queue:     { keyPath: "id", autoIncrement: true, indexes: [["status", "status"], ["table", "table"]] },
  printer:        { keyPath: "id", autoIncrement: true, indexes: [["type", "type"]] },
  logs:           { keyPath: "id", autoIncrement: true, indexes: [["date", "date"], ["type", "type"]] },
};

/** A short, good-enough-unique id for matching the same record across
 *  devices — not a full UUID, but collision odds are negligible for a
 *  single small business's data volume. */
function genUID() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
}

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const tx = event.target.transaction;

      for (const [storeName, def] of Object.entries(STORES)) {
        let store;
        if (!db.objectStoreNames.contains(storeName)) {
          store = db.createObjectStore(storeName, {
            keyPath: def.keyPath,
            autoIncrement: !!def.autoIncrement,
          });
        } else {
          store = tx.objectStore(storeName);
        }
        (def.indexes || []).forEach(([idxName, idxKey, opts]) => {
          if (!store.indexNames.contains(idxName)) {
            store.createIndex(idxName, idxKey, opts || {});
          }
        });
      }

      // Backfill a "uid" on any pre-existing records in syncable tables that
      // don't have one yet, so old data (created before sync existed) can
      // still be matched correctly once two-way sync starts running.
      SYNCABLE_TABLES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) return;
        const store = tx.objectStore(storeName);
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) return;
          const record = cursor.value;
          if (!record.uid) {
            record.uid = genUID();
            cursor.update(record);
          }
          cursor.continue();
        };
      });
    };

    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror = (event) => reject(event.target.error);
  });
  return _dbPromise;
}

/** Generic promise wrapper around an IDBRequest */
function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  async add(storeName, value) {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    const result = await reqToPromise(tx.objectStore(storeName).add(value));
    return result;
  },

  async put(storeName, value) {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    const result = await reqToPromise(tx.objectStore(storeName).put(value));
    return result;
  },

  async get(storeName, key) {
    const db = await openDB();
    const tx = db.transaction(storeName, "readonly");
    return reqToPromise(tx.objectStore(storeName).get(key));
  },

  async getAll(storeName) {
    const db = await openDB();
    const tx = db.transaction(storeName, "readonly");
    return reqToPromise(tx.objectStore(storeName).getAll());
  },

  async getByIndex(storeName, indexName, value) {
    const db = await openDB();
    const tx = db.transaction(storeName, "readonly");
    const idx = tx.objectStore(storeName).index(indexName);
    return reqToPromise(idx.getAll(value));
  },

  async delete(storeName, key) {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    await reqToPromise(tx.objectStore(storeName).delete(key));
  },

  async count(storeName) {
    const db = await openDB();
    const tx = db.transaction(storeName, "readonly");
    return reqToPromise(tx.objectStore(storeName).count());
  },

  async clearAll() {
    const db = await openDB();
    const names = Array.from(db.objectStoreNames);
    const tx = db.transaction(names, "readwrite");
    await Promise.all(names.map((n) => reqToPromise(tx.objectStore(n).clear())));
  },
};

/** Seed default admin + operator + settings on first run only. */
async function seedIfEmpty() {
  const userCount = await DB.count("users");
  if (userCount === 0) {
    await DB.add("users", {
      type: "admin",
      username: "admin",
      password: "admin123", // Phase 1 placeholder; will be hashed in a later pass
      name: "Owner",
      createdAt: Date.now(),
    });
    await DB.add("users", {
      type: "operator",
      pin: "1234",
      name: "Operator",
      createdAt: Date.now(),
    });
  }

  const settingsCount = await DB.count("settings");
  if (settingsCount === 0) {
    await DB.put("settings", { key: "company", value: { name: "My Food Business", gst: "", fssai: "", address: "" } });
    await DB.put("settings", { key: "theme", value: "default" });
    await DB.put("settings", { key: "invoicePrefix", value: "INV-" });
    await DB.put("settings", { key: "lastInvoiceNo", value: 0 });
  }
}

/** Adds a record to the sync queue — called after any create/update to
 *  data that should reach Google Sheets. Safe to call even if sync isn't
 *  configured yet; it just waits in the queue until it is. */
async function queueSync(table, recordId) {
  await DB.add("sync_queue", {
    table, recordId, status: "pending", retryCount: 0, createdAt: Date.now(),
  });
}

/** Call this once on app start (login page + dashboard both do this). */
async function initDB() {
  await openDB();
  await seedIfEmpty();
  return DB;
}
