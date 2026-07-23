# FoodERP Lite — Phase 8: Testing, Optimization & Deployment

All 8 phases of the original plan are now built. This file covers the
last mile: how to actually test it properly, get it onto your mother's
phone, and (optionally) turn it into a real installable APK.

---

## 1. Two ways to get this onto a phone

### Option A — Install as a PWA (fastest, do this first)
No app store, no APK, no Android Studio. Takes minutes.

1. Put the whole `FoodERP` folder on any web host that serves over
   **HTTPS** (service workers require it — `file://` and plain `http://`
   won't work for the offline features). Free options that work well
   for a small business app like this:
   - **GitHub Pages** — free, push the folder to a repo, enable Pages.
   - **Netlify** or **Vercel** — drag-and-drop the folder, get a live
     HTTPS URL in under a minute.
   - **Firebase Hosting** — `firebase deploy`, also free at this scale.
2. Open that URL on your mother's Android phone in **Chrome**.
3. Chrome will offer "Add to Home Screen" (or use the ⋮ menu → Install
   app). It now behaves like a real app — own icon, opens full-screen,
   works with no internet.
4. Log in once with PIN `1234` (change this later — see note below).

This gets you 90% of what an APK gives you, today, with zero build
tooling. **I'd recommend this first**, and only move to a real APK
(Option B) once you know the shop actually wants it long-term.

### Option B — Build a real Android APK (native app)
This needs **Android Studio installed on a computer** — it can't be
done inside this chat, since compiling Android apps requires the
Android SDK and Gradle toolchain running locally. The project is
already set up for it:

```bash
cd FoodERP
npm install
npx cap add android
npx cap sync android
npx cap open android
```

That last command opens the project in Android Studio, where you hit
**Build → Build Bundle(s)/APK(s) → Build APK(s)**. Android Studio can
also sign and build a release APK for the Play Store if you eventually
want that route.

**Why bother with an APK if the PWA already works?** Two real reasons:
1. **Bluetooth printing gets more reliable.** Web Bluetooth (used in
   Phase 5) is BLE-only. A native Capacitor build can add a Bluetooth
   Serial plugin (`@capacitor-community/bluetooth-le` or similar) to
   also reach classic SPP printers — the majority of cheap thermal
   printers. This is a follow-up task once you know which printer
   model the shop actually bought.
2. It shows up as a normal app icon without the "Install" step.

---

## 2. Before handing this to your mother — do this first

- **Change the default PIN and admin password.** Right now the app
  seeds PIN `1234` and admin login `admin` / `admin123` so there's
  something to log in with immediately. Log in as admin, and update
  these before real use (a dedicated "change PIN/password" screen
  wasn't in the original module list — let me know if you'd like one
  added; for now it can be done directly by editing the `users` store
  via Settings → Backup export → edit the JSON → restore).
- **Fill in Settings → Company Details** (name, GST, FSSAI, address,
  logo) so receipts and labels look right from day one.
- **Take a backup immediately after first setup**
  (Settings → Export Full Backup) and again periodically — everything
  lives only in this browser's local storage on this one device. If
  the browser data gets cleared or the phone is reset, unsynced data
  is gone unless Google Sheets sync (Phase 7) or a manual backup
  covers it.

---

## 3. Known limitations (read before relying on hardware features)

| Feature | Limitation |
|---|---|
| Bluetooth printing | BLE printers only, in Chrome/Edge (Android or desktop). Not Safari/iOS. Classic-SPP printers need Option B + a native plugin. |
| Camera barcode scanning | Needs `BarcodeDetector` support — Chrome/Edge on Android or desktop. Falls back to manual/USB-scanner entry everywhere it's used. |
| Google Sheets sync | One-way (device → Sheets). The Sheet is a backup/reporting copy, not something to edit and expect to flow back down. |
| Offline storage | All data lives in this browser's IndexedDB on this device. Not shared across devices except through Sheets sync. Back up regularly. |
| iOS / Safari | PWA install works, but Bluetooth printing and camera barcode scanning won't — iOS doesn't support the underlying browser APIs used here. |

---

## 4. What's built vs. what's still open

**Complete (Phases 1–8):** offline database, PIN + admin login, all
4 masters, Purchase/Production/Inventory, Sales & Billing, Bluetooth
printing, real Code128/QR generation, camera + USB barcode scanning,
5-tab Reports with charts and CSV export, Google Sheets sync, Settings,
full JSON backup/restore, and this deployment path.

**Reasonable next additions**, if useful later: a proper "change
PIN/password" screen, multiple operator PINs (right now there's one
shared operator PIN), multi-user permission levels beyond
Operator/Admin, and the native Bluetooth Serial plugin mentioned above.
