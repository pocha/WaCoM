// Shared Firebase init + auth helpers, imported by every dashboard/community
// page (not the public form page, which stays fully anonymous but does use
// the same Functions caller for submitApplication).
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import {firebaseConfig} from "./firebase-config.js";
import {WATOBOT_API_BASE} from "./watobot-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-south1");

// `npm start` serves public/ on localhost — point at the local emulator
// suite (firebase.json: auth 9099, functions 5001, firestore 8080) instead
// of the real project whenever running from there.
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  connectAuthEmulator(auth, "http://localhost:9099", {disableWarnings: true});
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
}

export function call(name) {
  const fn = httpsCallable(functions, name);
  return (data) => fn(data).then((res) => res.data);
}

// onAuthStateChanged can fire once with a premature/unsettled state (e.g.
// null) before the SDK finishes restoring a persisted session from
// IndexedDB, then fire again with the real state — a page that reacts to
// that first null by redirecting away never sees the second, correct
// callback. authStateReady() waits for the SDK's initial determination to
// settle before we ever start listening, so the first callback here is
// always the real one.
export function onAuthReady(callback) {
  auth.authStateReady().then(() => onAuthStateChanged(auth, callback));
}

export async function signInWithApiKey(apiKey, name) {
  const validateAndSignIn = call("validateAndSignIn");
  const {token} = await validateAndSignIn({apiKey, name});
  await signInWithCustomToken(auth, token);
}

export function logOut() {
  return signOut(auth);
}

// Mods/{uid} is owner-read-only (firestore.rules) — used to get the mod's
// own Watobot API key (for the direct-from-browser calls below) and name
// (for approved_by_name/rejected_by_name, without needing a Function to
// look up another mod's otherwise-locked-down doc). Never call this for
// anyone but the signed-in user; Firestore denies it anyway.
export async function getOwnMod() {
  const snap = await getDoc(doc(db, "Mods", auth.currentUser.uid));
  if (!snap.exists()) throw new Error("No Watobot API key on file for this account");
  return snap.data();
}

// Watobot allows cross-origin calls from anywhere (see watobot-config.js),
// so the browser talks to it directly instead of proxying through a
// Function for actions that don't need server-side trust — mirrors
// functions/src/watobotClient.ts's watobotFetch.
export async function watobotFetch(apiKey, path, init) {
  const response = await fetch(`${WATOBOT_API_BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Watobot API error (${response.status}): ${body}`);
  }
  return response.json();
}
