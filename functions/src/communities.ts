import {onCall} from "firebase-functions/v2/https";
import {db} from "./admin";
import {getModApiKey, requireUid} from "./modAccess";
import {listCommunities} from "./watobotClient";

// The only server step left in onboarding: Watobot is the sole source of
// truth for "is this account actually an admin of this WhatsApp Community",
// and a client can't be trusted to self-report that. Persisting the
// verified list to Mods/{uid}.communities lets firestore.rules gate the
// actual Communities/{jid} write (done directly by the client) on it,
// without needing a Function for every single onboard click.
export const listMyCommunities = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const apiKey = await getModApiKey(uid);
  const communities = await listCommunities(apiKey);

  await db.collection("Mods").doc(uid).update({
    communities: communities.map((c) => c.id),
  });

  const onboarded = await Promise.all(
    communities.map(async (c) => {
      const snap = await db.collection("Communities").doc(c.id).get();
      return {...c, onboarded: snap.exists};
    })
  );
  return {communities: onboarded};
});
