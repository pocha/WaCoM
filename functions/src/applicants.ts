import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin";
import {API_KEY_ENCRYPTION_KEY} from "./crypto";
import {getModApiKey, requireCommunityMod, requireUid} from "./modAccess";
import {getCommunityInvite, sendMessage} from "./watobotClient";
import {ApplicantDoc} from "./types";

export const approveApplicant = onCall(
  {secrets: [API_KEY_ENCRYPTION_KEY]},
  async (request) => {
    const uid = requireUid(request.auth);
    const communityJid = request.data?.communityJid;
    const applicantId = request.data?.applicantId;
    if (!communityJid || !applicantId) {
      throw new HttpsError("invalid-argument", "communityJid and applicantId are required");
    }

    await requireCommunityMod(uid, communityJid);
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

    const apiKey = await getModApiKey(uid);
    const invite = await getCommunityInvite(apiKey, communityJid);
    await sendMessage(
      apiKey,
      applicant.phone,
      `You've been approved to join! Tap to join: ${invite.link}`
    );

    await applicantRef.update({
      status: "pending_join",
      approved_by: uid,
      invited_at: FieldValue.serverTimestamp(),
    });

    return {success: true};
  }
);

export const rejectApplicant = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const communityJid = request.data?.communityJid;
  const applicantId = request.data?.applicantId;
  if (!communityJid || !applicantId) {
    throw new HttpsError("invalid-argument", "communityJid and applicantId are required");
  }

  await requireCommunityMod(uid, communityJid);
  const applicantRef = db
    .collection("Communities")
    .doc(communityJid)
    .collection("Applicants")
    .doc(applicantId);

  await applicantRef.update({
    status: "rejected",
    rejected_by: uid,
    rejected_at: FieldValue.serverTimestamp(),
  });

  return {success: true};
});
