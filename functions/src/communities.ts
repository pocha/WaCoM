import {onCall} from "firebase-functions/v2/https";
import {db} from "./admin";
import {getModApiKey, requireUid} from "./modAccess";
import {getCommunityInfo, listCommunities} from "./watobotClient";
import {CommunityDoc} from "./types";

// The only server step left in onboarding: Watobot is the sole source of
// truth for "is this account actually an admin of this WhatsApp Community",
// and a client can't be trusted to self-report that. Persisting the
// verified list to Mods/{uid}.communities lets firestore.rules gate the
// actual Communities/{jid} write (done directly by the client) on it,
// without needing a Function for every single onboard click.
//
// This is also the only place pictureUrl/inviteLink are refreshed from
// Watobot: fetching them here (one mudslide round-trip per community,
// piggybacking on the connection this call already opens) means onboarding
// and approving an applicant can both just read the cached Firestore value
// instead of hitting Watobot again. Clicking "Load All My Communities"
// re-runs this and refreshes the cache.
export const listMyCommunities = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const apiKey = await getModApiKey(uid);
  const communities = await listCommunities(apiKey);

  await db.collection("Mods").doc(uid).update({
    communities: communities.map((c) => c.id),
  });

  const enriched = await Promise.all(
    communities.map(async (c) => {
      const ref = db.collection("Communities").doc(c.id);
      const snap = await ref.get();
      const info = await getCommunityInfo(apiKey, c.id);
      if (snap.exists) {
        await ref.update({
          pictureUrl: info.pictureUrl,
          inviteLink: info.inviteLink,
        });
      }
      const existing = snap.data() as CommunityDoc | undefined;
      return {
        ...c,
        pictureUrl: info.pictureUrl,
        inviteLink: info.inviteLink,
        onboarded: snap.exists,
        onboardedByName: existing?.onboarded_by_name ?? null,
      };
    })
  );
  return {communities: enriched};
});
