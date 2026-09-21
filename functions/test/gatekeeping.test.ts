import {readFileSync} from "fs";
import {beforeAll, afterAll, describe, expect, test} from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  collection,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import {installWatobotMock} from "./watobotMock";

// This suite exercises the contract the client pages (dashboard.html,
// community-gate-keeping.html) rely on: firestore.rules-enforced direct
// writes plus the handful of Cloud Functions, with every Watobot call
// mocked. It doesn't load the actual HTML/JS (no DOM here), so each
// "client step" below is the same Firestore/fetch calls those pages make,
// inlined directly.
//
// Tests run in declared order and share Firestore state across the whole
// file — later tests depend on documents earlier tests created.

const COMMUNITY_JID = "community1@g.us";
const ALICE_PHONE = "+14155552671";
const BOB_PHONE = "+14155552672";
const APPLICANT_PHONE = "+14155552673";
const APPLICANT2_PHONE = "+14155552674";
const UID_ALICE = `wa_${ALICE_PHONE}`;
const UID_BOB = `wa_${BOB_PHONE}`;
const PICTURE_URL = "https://pps.whatsapp.net/v/community1.jpg";
const INVITE_LINK = "https://chat.whatsapp.com/ABC123";

let testEnv: RulesTestEnvironment;
const watobot = installWatobotMock();

// Imported after env vars (see vitest.config.ts) are in place, so the
// admin SDK module-level `initializeApp()` in src/admin.ts targets the
// emulator instead of production.
const {validateAndSignIn} = await import("../src/auth");
const {listMyCommunities} = await import("../src/communities");
const {submitApplication} = await import("../src/forms");
const {hourlyJoinCheck} = await import("../src/cron");
const {db: adminDb, auth: adminAuth} = await import("../src/admin");

beforeAll(async () => {
  // Must match whatever project the admin SDK actually resolved to (via
  // `firebase emulators:exec`'s FIREBASE_CONFIG, which wins over any
  // GCLOUD_PROJECT override) — otherwise rules-unit-testing's client and
  // the admin SDK write to two different project namespaces inside the
  // same emulator, and every rule's get()/exists() cross-doc lookup
  // silently sees an empty collection instead of an error.
  const projectId = adminAuth.app.options.projectId!;
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync("../firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  watobot.install();
});

afterAll(async () => {
  await testEnv.cleanup();
});

function clientDb(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

describe("mod Alice: onboarding through approval", () => {
  test("signs in with a Watobot API key", async () => {
    watobot.on("GET", "/api/whatsapp", () => ({connected: true, phoneNumber: ALICE_PHONE}));

    const result = await validateAndSignIn.run({
      data: {apiKey: "alice-key", name: "Alice"},
      auth: undefined,
    } as never);

    expect(result.token).toEqual(expect.any(String));
    const mod = (await adminDb.collection("Mods").doc(UID_ALICE).get()).data();
    expect(mod).toMatchObject({api_key: "alice-key", name: "Alice"});
  });

  test("fetches her communities, caching picture/invite for later", async () => {
    watobot.on("GET", "/api/whatsapp/communities", () => ({
      communities: [{id: COMMUNITY_JID, name: "Test Community"}],
    }));
    watobot.on("GET", `/api/whatsapp/communities/${encodeURIComponent(COMMUNITY_JID)}`, () => ({
      id: COMMUNITY_JID,
      subject: "Test Community",
      pictureUrl: PICTURE_URL,
      inviteLink: INVITE_LINK,
      participants: [{id: `${ALICE_PHONE}@s.whatsapp.net`, admin: "superadmin", phoneNumber: ALICE_PHONE}],
    }));

    const result = await listMyCommunities.run({data: {}, auth: {uid: UID_ALICE}} as never);

    // id/name/pictureUrl/inviteLink are plain pass-through of the mocked
    // Watobot response — not worth asserting. onboarded/onboardedByName are
    // actually computed by listMyCommunities from Firestore state, which is
    // the thing worth checking here.
    expect(result.communities).toEqual([
      expect.objectContaining({onboarded: false, onboardedByName: null}),
    ]);
    const mod = (await adminDb.collection("Mods").doc(UID_ALICE).get()).data();
    expect(mod?.communities).toEqual([COMMUNITY_JID]);
  });

  test("onboards the community as a direct client write", async () => {
    await setDoc(
      doc(clientDb(UID_ALICE), "Communities", COMMUNITY_JID),
      {
        name: "Test Community",
        pictureUrl: PICTURE_URL,
        inviteLink: INVITE_LINK,
        mods: arrayUnion(UID_ALICE),
        onboarded_by_name: "Alice",
        onboarded_at: serverTimestamp(),
      },
      {merge: true}
    );

    const community = (await adminDb.collection("Communities").doc(COMMUNITY_JID).get()).data();
    expect(community).toMatchObject({
      name: "Test Community",
      mods: [UID_ALICE],
      onboarded_by_name: "Alice",
    });
  });

  test("creates a form as a direct client write", async () => {
    await setDoc(doc(clientDb(UID_ALICE), "Communities", COMMUNITY_JID, "Forms", "form1"), {
      communityName: "Test Community",
      communityPictureUrl: PICTURE_URL,
      questions: [{id: "q1", label: "Why do you want to join?", required: true}],
      active: true,
      created_by: UID_ALICE,
      created_at: serverTimestamp(),
    });

    const form = (await adminDb
      .collection("Communities").doc(COMMUNITY_JID)
      .collection("Forms").doc("form1").get()).data();
    expect(form).toMatchObject({active: true, created_by: UID_ALICE});
  });

  test("accepts a public form submission", async () => {
    const result = await submitApplication.run({
      data: {
        communityJid: COMMUNITY_JID,
        formId: "form1",
        phone: APPLICANT_PHONE,
        answers: {q1: "Because reasons"},
      },
      auth: undefined,
    } as never);

    expect(result.success).toBe(true);
    const applicant = (await adminDb
      .collection("Communities").doc(COMMUNITY_JID)
      .collection("Applicants").doc(result.applicantId).get()).data();
    expect(applicant).toMatchObject({status: "applied", phone: APPLICANT_PHONE});
  });

  test("applicant is visible to a mod, but not to a non-mod", async () => {
    const snap = await getDocs(collection(clientDb(UID_ALICE), "Communities", COMMUNITY_JID, "Applicants"));
    expect(snap.docs.map((d) => d.data().status)).toEqual(["applied"]);

    // Bob hasn't onboarded/joined this community yet — isMod() must deny him.
    await assertFails(getDocs(collection(clientDb(UID_BOB), "Communities", COMMUNITY_JID, "Applicants")));
  });

  test("approves the applicant: sends the cached invite link, flips status", async () => {
    watobot.on("POST", "/api/message", () => ({success: true}));
    const applicantId = APPLICANT_PHONE.replace(/\D/g, "");

    const community = (await adminDb.collection("Communities").doc(COMMUNITY_JID).get()).data()!;
    const message = `You've been approved to join "${community.name}"! Tap to join: ${community.inviteLink}`;
    await fetch("https://watobot.test/api/message", {
      method: "POST",
      body: JSON.stringify({to: APPLICANT_PHONE, message}),
    });
    await updateDoc(doc(clientDb(UID_ALICE), "Communities", COMMUNITY_JID, "Applicants", applicantId), {
      status: "pending_join",
      approved_by: UID_ALICE,
      approved_by_name: "Alice",
      invited_at: serverTimestamp(),
    });

    const sendCall = watobot.calls.find((c) => c.pathname === "/api/message");
    expect(sendCall?.body).toMatchObject({to: APPLICANT_PHONE});
    expect((sendCall?.body as {message: string}).message).toContain(INVITE_LINK);

    const applicant = (await adminDb
      .collection("Communities").doc(COMMUNITY_JID)
      .collection("Applicants").doc(applicantId).get()).data();
    expect(applicant).toMatchObject({status: "pending_join", approved_by_name: "Alice"});
  });

  test("hourly join check flips pending_join to joined once Watobot confirms membership", async () => {
    watobot.on("GET", `/api/whatsapp/communities/${encodeURIComponent(COMMUNITY_JID)}`, () => ({
      id: COMMUNITY_JID,
      subject: "Test Community",
      pictureUrl: PICTURE_URL,
      inviteLink: INVITE_LINK,
      participants: [
        {id: `${ALICE_PHONE}@s.whatsapp.net`, admin: "superadmin", phoneNumber: ALICE_PHONE},
        {id: `${APPLICANT_PHONE}@s.whatsapp.net`, admin: null, phoneNumber: APPLICANT_PHONE},
      ],
    }));
    const applicantId = APPLICANT_PHONE.replace(/\D/g, "");

    await hourlyJoinCheck.run({} as never);

    const applicant = (await adminDb
      .collection("Communities").doc(COMMUNITY_JID)
      .collection("Applicants").doc(applicantId).get()).data();
    expect(applicant).toMatchObject({status: "joined"});
  });
});

describe("mod Bob: joins an already-onboarded community", () => {
  test("signs in with his own Watobot API key", async () => {
    watobot.on("GET", "/api/whatsapp", () => ({connected: true, phoneNumber: BOB_PHONE}));

    await validateAndSignIn.run({data: {apiKey: "bob-key", name: "Bob"}, auth: undefined} as never);

    const mod = (await adminDb.collection("Mods").doc(UID_BOB).get()).data();
    expect(mod).toMatchObject({api_key: "bob-key", name: "Bob"});
  });

  test("loading his communities shows Alice's community as already onboarded", async () => {
    watobot.on("GET", "/api/whatsapp/communities", () => ({
      communities: [{id: COMMUNITY_JID, name: "Test Community"}],
    }));
    watobot.on("GET", `/api/whatsapp/communities/${encodeURIComponent(COMMUNITY_JID)}`, () => ({
      id: COMMUNITY_JID,
      subject: "Test Community",
      pictureUrl: PICTURE_URL,
      inviteLink: INVITE_LINK,
      participants: [],
    }));

    const result = await listMyCommunities.run({data: {}, auth: {uid: UID_BOB}} as never);

    expect(result.communities[0]).toMatchObject({onboarded: true, onboardedByName: "Alice"});
    // Verified admin of the jid now, per Mods/{uid}.communities — but not a
    // mod of the Communities/{jid} doc itself yet, so he still can't read it.
    await assertFails(getDoc(doc(clientDb(UID_BOB), "Communities", COMMUNITY_JID)));
  });

  test("joins as a mod without overwriting who originally onboarded it", async () => {
    await setDoc(
      doc(clientDb(UID_BOB), "Communities", COMMUNITY_JID),
      {
        name: "Test Community",
        pictureUrl: PICTURE_URL,
        inviteLink: INVITE_LINK,
        mods: arrayUnion(UID_BOB),
        onboarded_at: serverTimestamp(),
      },
      {merge: true}
    );

    const community = (await adminDb.collection("Communities").doc(COMMUNITY_JID).get()).data();
    expect(community?.mods).toEqual(expect.arrayContaining([UID_ALICE, UID_BOB]));
    expect(community?.onboarded_by_name).toBe("Alice");

    // Untouched: the original form and the already-joined applicant survive.
    const form = (await adminDb
      .collection("Communities").doc(COMMUNITY_JID)
      .collection("Forms").doc("form1").get()).data();
    expect(form?.active).toBe(true);
    const applicant = (await adminDb
      .collection("Communities").doc(COMMUNITY_JID)
      .collection("Applicants").doc(APPLICANT_PHONE.replace(/\D/g, "")).get()).data();
    expect(applicant?.status).toBe("joined");
  });

  test("can edit the form Alice created", async () => {
    await updateDoc(doc(clientDb(UID_BOB), "Communities", COMMUNITY_JID, "Forms", "form1"), {
      questions: [
        {id: "q1", label: "Why do you want to join?", required: true},
        {id: "q2", label: "Referred by?", required: false},
      ],
    });

    const form = (await adminDb
      .collection("Communities").doc(COMMUNITY_JID)
      .collection("Forms").doc("form1").get()).data();
    expect(form?.questions).toHaveLength(2);
  });

  test("rejects a new applicant, stamped with his own name", async () => {
    const submitResult = await submitApplication.run({
      data: {
        communityJid: COMMUNITY_JID,
        formId: "form1",
        phone: APPLICANT2_PHONE,
        answers: {q1: "Because reasons", q2: "A friend"},
      },
      auth: undefined,
    } as never);

    await updateDoc(
      doc(clientDb(UID_BOB), "Communities", COMMUNITY_JID, "Applicants", submitResult.applicantId),
      {status: "rejected", rejected_by: UID_BOB, rejected_by_name: "Bob", rejected_at: serverTimestamp()}
    );

    const applicant = (await adminDb
      .collection("Communities").doc(COMMUNITY_JID)
      .collection("Applicants").doc(submitResult.applicantId).get()).data();
    expect(applicant).toMatchObject({status: "rejected", rejected_by_name: "Bob"});
  });

  test("a rejected applicant can't resubmit", async () => {
    await expect(
      submitApplication.run({
        data: {
          communityJid: COMMUNITY_JID,
          formId: "form1",
          phone: APPLICANT2_PHONE,
          answers: {q1: "trying again"},
        },
        auth: undefined,
      } as never)
    ).rejects.toThrow(/already reviewed and rejected/);
  });
});
