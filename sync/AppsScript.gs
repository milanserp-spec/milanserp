/**
 * FoodERP Lite — Google Sheets Sync Receiver (Two-Way)
 * =========================================================
 * WHAT THIS IS
 * This is a Google Apps Script. It does NOT run inside the
 * FoodERP app — it runs on Google's servers, bound to a
 * Google Sheet. Devices PUSH their changes here (doPost),
 * and PULL the latest data from here (doGet?action=pull) so
 * that edits made on one device eventually show up on every
 * other device that syncs too.
 *
 * IMPORTANT — THIS IS NOT INSTANT / REAL-TIME
 * There's no way for a Google Sheet to notify a phone the
 * moment something changes. Sync happens when a device pushes
 * (after every change, if online) and pulls (every ~60 seconds
 * automatically while the app is open, or immediately when you
 * tap "Sync Now"). Expect changes to appear on other devices
 * within about a minute, not instantly.
 *
 * CONFLICTS
 * If the same record is edited on two devices before either
 * one syncs, the version that syncs LAST simply overwrites the
 * other — there's no merging of individual fields. For a small
 * shop this is normally fine, but it's worth knowing, especially
 * for stock quantities: try to keep billing happening mainly on
 * one device, and sync often.
 *
 * HOW TO SET IT UP (one time, ~5 minutes)
 * 1. Go to https://sheets.google.com and create a new blank
 *    spreadsheet. Name it something like "FoodERP Data".
 * 2. In that sheet: Extensions → Apps Script.
 * 3. Delete anything in the editor, paste this entire file in.
 * 4. Click Deploy → New deployment.
 *      - Type: "Web app"
 *      - Execute as: "Me"
 *      - Who has access: "Anyone"
 *        (Needed so devices can reach it without a Google login
 *         prompt. Treat the resulting URL like a password —
 *         anyone with it can read and write this sheet.)
 * 5. Click Deploy, authorize the permissions Google asks for.
 * 6. Copy the "Web app URL" it gives you.
 * 7. Paste that URL into FoodERP Lite → Admin → Sync page on
 *    EVERY device, and tap "Test Connection" on each.
 *
 * IF YOU EDIT AND RE-DEPLOY THIS SCRIPT LATER
 * Use Deploy → Manage deployments → edit (pencil) → New version,
 * NOT "New deployment" — that keeps the same URL so you don't
 * have to update it on every device again.
 */

function doGet(e) {
  var action = e.parameter && e.parameter.action;
  if (action === "pull") {
    return handlePull();
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "FoodERP Lite sync endpoint is live" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handlePull() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    var data = {};

    sheets.forEach(function (sheet) {
      var name = sheet.getName();
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow < 2 || lastCol < 1) { data[name] = []; return; }

      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      data[name] = rows.map(function (row) {
        var obj = {};
        headers.forEach(function (h, i) {
          if (!h) return;
          obj[h] = row[i];
        });
        return obj;
      }).filter(function (obj) {
        // Skip fully blank trailing rows
        return Object.keys(obj).some(function (k) { return obj[k] !== "" && obj[k] !== null; });
      });
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var table = body.table;
    var record = body.record;
    if (!table || !record) throw new Error("Missing table or record in the request.");

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(table);
    if (!sheet) {
      sheet = ss.insertSheet(table);
    }

    var lastCol = sheet.getLastColumn();
    var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

    var headerChanged = false;
    Object.keys(record).forEach(function (key) {
      if (headers.indexOf(key) === -1) {
        headers.push(key);
        headerChanged = true;
      }
    });
    if (headerChanged) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    // Upsert matched by "uid" (a globally unique id set by the app) so that
    // records created independently on different devices never collide.
    // Falls back to "id" only for older records synced before uid existed.
    var matchKey = record.uid ? "uid" : "id";
    var matchValue = record.uid || record.id;
    var matchIndex = headers.indexOf(matchKey);
    var targetRow = -1;

    if (matchIndex !== -1 && matchValue !== undefined && matchValue !== null) {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var colValues = sheet.getRange(2, matchIndex + 1, lastRow - 1, 1).getValues();
        for (var i = 0; i < colValues.length; i++) {
          if (String(colValues[i][0]) === String(matchValue)) {
            targetRow = i + 2;
            break;
          }
        }
      }
    }

    var rowValues = headers.map(function (h) {
      var v = record[h];
      if (v === undefined || v === null) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return v;
    });

    if (targetRow === -1) {
      sheet.appendRow(rowValues);
    } else {
      sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
