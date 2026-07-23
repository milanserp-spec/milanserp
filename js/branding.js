/* =========================================================
   FoodERP Lite — Branding
   Lets the shop owner rename the app throughout the UI
   (sidebar, login screen) without editing any code. Stored
   as settings.appName. Falls back to "FoodERP Lite" if never set.

   Note: this does NOT change the name shown on the phone's
   home screen icon after "Add to Home Screen" — that comes
   from manifest.json, which is read once at install time and
   can't be changed by JavaScript afterwards. To change that,
   edit the "name" and "short_name" fields in manifest.json
   directly and have people reinstall the icon.
   ========================================================= */

async function applyBranding() {
  try {
    const rec = await DB.get("settings", "appName");
    const name = (rec && rec.value) || "FoodERP Lite";
    document.querySelectorAll("#brandName").forEach((el) => { el.textContent = name; });
  } catch (e) { /* settings store may not exist yet on very first load — ignore */ }
}
