// Shared Firebase init + auth helpers, imported by every dashboard/community
// page (not the public form page, which stays fully anonymous but does use
// the same Functions caller for submitApplication).
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import {firebaseConfig} from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");

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
