import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {isValidPhoneNumber} from "libphonenumber-js";
import {db} from "./admin";
import {requireCommunityMod, requireUid} from "./modAccess";
import {ApplicantDoc, FormDoc, FormQuestion} from "./types";

// The applicant doc id, so a resubmission overwrites the same doc instead of
// piling up duplicates — phone is already validated as a real E.164 number
// by the time this runs, so the digits alone are a stable, unique key.
function phoneDocId(phone: string): string {
  return phone.replace(/\D/g, "");
}

// Public form pages read Communities/{jid}/Forms/{formId} directly via the
// Firestore client SDK (allowed by firestore.rules — Forms are publicly
// readable), so there's no separate getPublicForm function.

export const createForm = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const communityJid = request.data?.communityJid;
  const questions = request.data?.questions;
  if (!communityJid || typeof communityJid !== "string") {
    throw new HttpsError("invalid-argument", "communityJid is required");
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new HttpsError("invalid-argument", "At least one question is required");
  }
  const cleanQuestions: FormQuestion[] = questions.map((q, i) => ({
    id: q.id || `q${i}`,
    label: String(q.label ?? "").trim(),
    required: Boolean(q.required),
  }));
  if (cleanQuestions.some((q) => !q.label)) {
    throw new HttpsError("invalid-argument", "Every question needs a label");
  }

  const community = await requireCommunityMod(uid, communityJid);
  const formsRef = db.collection("Communities").doc(communityJid).collection("Forms");

  // Only one active form per community at a time — deactivate any others.
  const activeSnap = await formsRef.where("active", "==", true).get();
  const batch = db.batch();
  activeSnap.forEach((doc) => batch.update(doc.ref, {active: false}));

  const newFormRef = formsRef.doc();
  batch.set(newFormRef, {
    communityName: community.name,
    communityPictureUrl: community.pictureUrl,
    questions: cleanQuestions,
    active: true,
    created_by: uid,
    created_at: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return {success: true, formId: newFormRef.id};
});

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
