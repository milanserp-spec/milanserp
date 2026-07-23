/* =========================================================
   FoodERP Lite — Authentication
   Operator: 4-digit PIN, no username.
   Admin: username + password, full access.
   Session is kept in sessionStorage so it clears when the
   app/browser tab is closed (simple, offline-safe).
   ========================================================= */

const SESSION_KEY = "foodErpSession";

function saveSession(user) {
  const session = {
    id: user.id,
    type: user.type,
    name: user.name,
    loginAt: Date.now(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/** Redirects to login if nobody is signed in. Call at top of every protected page. */
function requireSession(allowedTypes) {
  const session = getSession();
  if (!session || (allowedTypes && !allowedTypes.includes(session.type))) {
    window.location.href = resolvePath("index.html");
    return null;
  }
  return session;
}

/** Pages live at different folder depths; this keeps redirects correct either way. */
function resolvePath(target) {
  const inPages = window.location.pathname.includes("/pages/");
  return inPages ? `../${target}` : target;
}

async function loginOperator(pin) {
  const matches = await DB.getByIndex("users", "pin", pin);
  const operator = matches.find((u) => u.type === "operator");
  if (!operator) {
    throw new Error("Incorrect PIN. Please try again.");
  }
  return saveSession(operator);
}

async function loginAdmin(username, password) {
  const matches = await DB.getByIndex("users", "username", username);
  const admin = matches.find((u) => u.type === "admin" && u.password === password);
  if (!admin) {
    throw new Error("Incorrect username or password.");
  }
  return saveSession(admin);
}

function logout() {
  clearSession();
  window.location.href = resolvePath("index.html");
}
