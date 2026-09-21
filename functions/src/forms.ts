import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {isValidPhoneNumber} from "libphonenumber-js";
import {db} from "./admin";
import {ApplicantDoc, FormDoc} from "./types";

// The applicant doc id, so a resubmission overwrites the same doc instead of
// piling up duplicates — phone is already validated as a real E.164 number
// by the time this runs, so the digits alone are a stable, unique key.
function phoneDocId(phone: string): string {
  return phone.replace(/\D/g, "");
}

// Public form pages read Communities/{jid}/Forms/{formId} directly via the
// Firestore client SDK (allowed by firestore.rules — Forms are publicly
// readable). Mods create/deactivate forms as direct client writes too
// (firestore.rules: isMod(communityId)) — no server step needed there since
// it's pure Firestore data, no Watobot call involved.

export const submitApplication = onCall(async (request) => {
  const communityJid = request.data?.communityJid;
  const formId = request.data?.formId;
  const phone = request.data?.phone;
  const answers = request.data?.answers;

  if (!communityJid || !formId || typeof communityJid !== "string" || typeof formId !== "string") {
    throw new HttpsError("invalid-argument", "communityJid and formId are required");
  }
  if (!phone || typeof phone !== "string" || !isValidPhoneNumber(phone)) {
    throw new HttpsError(
      "invalid-argument",
      "Enter a valid WhatsApp number with country code (e.g. +14155552671)"
    );
  }
  if (typeof answers !== "object" || answers === null) {
    throw new HttpsError("invalid-argument", "answers must be provided");
  }

  const formRef = db
    .collection("Communities")
    .doc(communityJid)
    .collection("Forms")
    .doc(formId);
  const formSnap = await formRef.get();
  const form = formSnap.data() as FormDoc | undefined;
  if (!formSnap.exists || !form?.active) {
    throw new HttpsError("failed-precondition", "This form is no longer accepting applications");
  }

  const applicantId = phoneDocId(phone);
  const applicantRef = db
    .collection("Communities")
    .doc(communityJid)
    .collection("Applicants")
    .doc(applicantId);
  const existing = await applicantRef.get();
  const existingData = existing.data() as ApplicantDoc | undefined;
  if (existingData?.status === "rejected") {
    throw new HttpsError(
      "failed-precondition",
      "Your application was already reviewed and rejected. Contact the community moderators if you'd like it reconsidered."
    );
  }

  // A resubmission fully replaces the prior attempt (including one that was
  // mid-approval) — same phone number, so it's the same person re-applying.
  await applicantRef.set({
    formId,
    phone,
    answers,
    questions: form.questions,
    status: "applied",
    applied_at: FieldValue.serverTimestamp(),
  });

  return {success: true, applicantId};
});
