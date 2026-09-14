import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin";
import {getModApiKey, requireUid} from "./modAccess";
import {getCommunityInfo, listCommunities, participantMatchesPhone} from "./watobotClient";
import {ModDoc} from "./types";

// Watobot's adminOnly filter already narrows this to communities the mod
// administers; onboardCommunity still re-verifies admin status itself
// before writing, since this list is just what the UI shows.
export const listMyCommunities = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const apiKey = await getModApiKey(uid);
  const communities = await listCommunities(apiKey);

  const onboarded = await Promise.all(
    communities.map(async (c) => {
      const snap = await db.collection("Communities").doc(c.id).get();
      return {...c, onboarded: snap.exists};
    })
  );
  return {communities: onboarded};
});

export const onboardCommunity = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const communityJid = request.data?.communityJid;
  if (!communityJid || typeof communityJid !== "string") {
    throw new HttpsError("invalid-argument", "communityJid is required");
  }

  const apiKey = await getModApiKey(uid);
  const modSnap = await db.collection("Mods").doc(uid).get();
  const mod = modSnap.data() as ModDoc;

  const info = await getCommunityInfo(apiKey, communityJid);
  const isAdmin = info.participants.some(
    (p) => participantMatchesPhone(p, mod.phone_number) && p.admin
  );
  if (!isAdmin) {
    throw new HttpsError(
      "permission-denied",
      "You're not an admin of this WhatsApp Community"
    );
  }

  await db.collection("Communities").doc(communityJid).set(
    {
      name: info.subject,
      mods: FieldValue.arrayUnion(uid),
      onboarded_at: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );

  return {success: true, community: {id: communityJid, name: info.subject}};
});
