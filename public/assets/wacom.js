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
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import {firebaseConfig} from "./firebase-config.js";

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

export function onAuthReady(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithApiKey(apiKey) {
  const validateAndSignIn = call("validateAndSignIn");
  const {token} = await validateAndSignIn({apiKey});
  await signInWithCustomToken(auth, token);
}

export function logOut() {
  return signOut(auth);
}
