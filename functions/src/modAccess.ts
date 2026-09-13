import {HttpsError} from "firebase-functions/v2/https";
import {db} from "./admin";
import {decryptApiKey} from "./crypto";
import {CommunityDoc, ModDoc} from "./types";

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
  return decryptApiKey(mod.api_key);
}

export async function requireCommunityMod(uid: string, communityJid: string): Promise<CommunityDoc> {
  const snap = await db.collection("Communities").doc(communityJid).get();
  const community = snap.data() as CommunityDoc | undefined;
  if (!community || !community.mods.includes(uid)) {
    throw new HttpsError("permission-denied", "You don't administer this community");
  }
  return community;
}
