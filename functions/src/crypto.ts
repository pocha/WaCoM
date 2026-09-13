import * as crypto from "crypto";
import {defineSecret} from "firebase-functions/params";

// Set with: firebase functions:secrets:set API_KEY_ENCRYPTION_KEY
// (any 32+ byte random string, e.g. `openssl rand -hex 32`).
export const API_KEY_ENCRYPTION_KEY = defineSecret("API_KEY_ENCRYPTION_KEY");

function getKey(): Buffer {
  return crypto.createHash("sha256").update(API_KEY_ENCRYPTION_KEY.value()).digest();
}

export function encryptApiKey(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(".");
}

export function decryptApiKey(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
