import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin";
import {getCommunityInfo, participantMatchesPhone} from "./watobotClient";
import {ApplicantDoc, CommunityDoc, ModDoc} from "./types";

// No manual "I've joined" link — approval sends the invite immediately, and
// this job periodically confirms actual membership so applicant status
// eventually reflects reality without relying on the applicant reporting it.
export const hourlyJoinCheck = onSchedule(
  {schedule: "every 60 minutes"},
  async () => {
    const pending = await db
      .collectionGroup("Applicants")
      .where("status", "==", "pending_join")
      .get();

    if (pending.empty) return;

    const grouped = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    for (const doc of pending.docs) {
      const communityJid = doc.ref.parent.parent?.id;
      if (!communityJid) continue;
      if (!grouped.has(communityJid)) grouped.set(communityJid, []);
      grouped.get(communityJid)!.push(doc);
    }

    for (const [communityJid, applicantDocs] of grouped) {
      try {
        const communitySnap = await db.collection("Communities").doc(communityJid).get();
        const community = communitySnap.data() as CommunityDoc | undefined;
        const modUid = community?.mods?.[0];
        if (!modUid) continue;

        const modSnap = await db.collection("Mods").doc(modUid).get();
        const mod = modSnap.data() as ModDoc | undefined;
        if (!mod) continue;

        const info = await getCommunityInfo(mod.api_key, communityJid);

        const batch = db.batch();
        for (const doc of applicantDocs) {
          const applicant = doc.data() as ApplicantDoc;
          const joined = info.participants.some((p) => participantMatchesPhone(p, applicant.phone));
          if (joined) {
            batch.update(doc.ref, {status: "joined", joined_at: FieldValue.serverTimestamp()});
          }
        }
        await batch.commit();
      } catch (err) {
        console.error(`hourlyJoinCheck failed for community ${communityJid}`, err);
      }
    }
  }
);
