import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db, auth} from "./admin";
import {getWhatsappStatus} from "./watobotClient";
import {encryptApiKey, API_KEY_ENCRYPTION_KEY} from "./crypto";
import {ModDoc} from "./types";

// Validates a pasted Watobot API key against Watobot itself, resolves the
// mod's stable WhatsApp identity (their own phone number) to use as the
// Firebase Auth uid, stores the key for later server-side use (sending
// approval messages, the hourly join check), and mints a custom token so
// Firestore rules can key access off request.auth.uid.
export const validateAndSignIn = onCall(
  {secrets: [API_KEY_ENCRYPTION_KEY]},
  async (request) => {
    const apiKey = request.data?.apiKey;
    if (!apiKey || typeof apiKey !== "string") {
      throw new HttpsError("invalid-argument", "apiKey is required");
    }

    const status = await getWhatsappStatus(apiKey);
    if (!status.connected || !status.phoneNumber) {
      throw new HttpsError(
        "failed-precondition",
        "This Watobot account isn't connected to WhatsApp yet."
      );
    }

    const uid = `wa_${status.phoneNumber}`;
    const now = FieldValue.serverTimestamp();
    const modRef = db.collection("Mods").doc(uid);
    const existing = await modRef.get();

    const data: Partial<ModDoc> = {
      api_key: encryptApiKey(apiKey),
      provider: "watobot",
      phone_number: status.phoneNumber,
      updated_at: now as unknown as FirebaseFirestore.Timestamp,
    };
    if (!existing.exists) {
      data.created_at = now as unknown as FirebaseFirestore.Timestamp;
    }
    await modRef.set(data, {merge: true});

    const token = await auth.createCustomToken(uid);
    return {token};
  }
);
