import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin";
import {getModApiKey, requireCommunityMod, requireUid} from "./modAccess";
import {getCommunityInvite, sendMessage} from "./watobotClient";
import {ApplicantDoc, ModDoc} from "./types";

export const approveApplicant = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const communityJid = request.data?.communityJid;
  const applicantId = request.data?.applicantId;
  if (!communityJid || !applicantId) {
    throw new HttpsError("invalid-argument", "communityJid and applicantId are required");
  }

  const community = await requireCommunityMod(uid, communityJid);
  const applicantRef = db
    .collection("Communities")
    .doc(communityJid)
    .collection("Applicants")
    .doc(applicantId);
  const applicantSnap = await applicantRef.get();
  const applicant = applicantSnap.data() as ApplicantDoc | undefined;
  if (!applicant) {
    throw new HttpsError("not-found", "Applicant not found");
  }

  const modSnap = await db.collection("Mods").doc(uid).get();
  const mod = modSnap.data() as ModDoc;

  const apiKey = await getModApiKey(uid);
  const invite = await getCommunityInvite(apiKey, communityJid);
  await sendMessage(
    apiKey,
    applicant.phone,
    `You've been approved to join "${community.name}"! Tap to join: ${invite.link}\n\n` +
      "Note: this invite link is shared by everyone, so clicking it first puts you in a pending-approval queue for the community. " +
      "An automatic check runs every hour and lets you in once it confirms your approval — no further action needed on your end."
  );

  await applicantRef.update({
    status: "pending_join",
    approved_by: uid,
    approved_by_name: mod.name,
    invited_at: FieldValue.serverTimestamp(),
  });

  return {success: true};
});

export const rejectApplicant = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const communityJid = request.data?.communityJid;
  const applicantId = request.data?.applicantId;
  if (!communityJid || !applicantId) {
    throw new HttpsError("invalid-argument", "communityJid and applicantId are required");
  }

  await requireCommunityMod(uid, communityJid);
  const modSnap = await db.collection("Mods").doc(uid).get();
  const mod = modSnap.data() as ModDoc;

  const applicantRef = db
    .collection("Communities")
    .doc(communityJid)
    .collection("Applicants")
    .doc(applicantId);

  await applicantRef.update({
    status: "rejected",
    rejected_by: uid,
    rejected_by_name: mod.name,
    rejected_at: FieldValue.serverTimestamp(),
  });

  return {success: true};
});
