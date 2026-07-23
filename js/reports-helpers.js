/* =========================================================
   FoodERP Lite — Reporting helpers
   Shared by pages/reports.html. CSV export opens cleanly in
   Excel/Google Sheets — kept as CSV (no extra library needed)
   rather than a heavy vendored .xlsx writer, for a smaller,
   more reliable offline app.
   ========================================================= */

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Returns { from, to } as Date objects for a named preset. */
function dateRangePreset(name) {
  const now = new Date();
  if (name === "today") {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (name === "week") {
    const from = new Date(now);
    from.setDate(from.getDate() - from.getDay()); // back to Sunday
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  if (name === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  if (name === "year") {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  return { from: startOfDay(now), to: endOfDay(now) };
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

/** rows: array of arrays (first row = headers). Triggers a browser download. */
function downloadCSV(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
