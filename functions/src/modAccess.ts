import {HttpsError} from "firebase-functions/v2/https";
import {db} from "./admin";
import {ModDoc} from "./types";

export function requireUid(auth: {uid: string} | undefined): string {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  return auth.uid;
}

export async function getModApiKey(uid: string): Promise<string> {
  const snap = await db.collection("Mods").doc(uid).get();
  const mod = snap.data() as ModDoc | undefined;
  if (!mod) {
    throw new HttpsError("failed-precondition", "No Watobot API key on file for this account");
  }
  return mod.api_key;
}
