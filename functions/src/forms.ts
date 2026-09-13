import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin";
import {requireCommunityMod, requireUid} from "./modAccess";
import {FormQuestion} from "./types";

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
  if (!phone || typeof phone !== "string" || phone.replace(/\D/g, "").length < 8) {
    throw new HttpsError("invalid-argument", "A valid phone number is required");
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
  if (!formSnap.exists || !formSnap.data()?.active) {
    throw new HttpsError("failed-precondition", "This form is no longer accepting applications");
  }

  const applicantRef = await db
    .collection("Communities")
    .doc(communityJid)
    .collection("Applicants")
    .add({
      formId,
      phone,
      answers,
      status: "applied",
      applied_at: FieldValue.serverTimestamp(),
    });

  return {success: true, applicantId: applicantRef.id};
});
