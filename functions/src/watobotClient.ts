import {defineString} from "firebase-functions/params";
import {HttpsError} from "firebase-functions/v2/https";

const WATOBOT_API_BASE = defineString("WATOBOT_API_BASE", {default: "https://watobot.xyz"});

export interface WhatsappStatus {
  connected: boolean;
  phoneNumber: string | null;
  reason?: string;
}

export interface CommunitySummary {
  id: string;
  name: string;
}

export interface CommunityParticipant {
  id: string;
  admin: string | null;
}

export interface CommunityInfo {
  id: string;
  subject: string;
  participants: CommunityParticipant[];
}

export interface CommunityInvite {
  code: string;
  link: string;
}

async function watobotFetch(apiKey: string, path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${WATOBOT_API_BASE.value()}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) {
    throw new HttpsError("unauthenticated", "Invalid or expired Watobot API key");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpsError("internal", `Watobot API error (${response.status}): ${body}`);
  }
  return response.json();
}

export async function getWhatsappStatus(apiKey: string): Promise<WhatsappStatus> {
  return watobotFetch(apiKey, "/api/whatsapp");
}

export async function listCommunities(apiKey: string): Promise<CommunitySummary[]> {
  const {communities} = await watobotFetch(apiKey, "/api/whatsapp/communities");
  return communities;
}

export async function getCommunityInfo(apiKey: string, communityJid: string): Promise<CommunityInfo> {
  return watobotFetch(apiKey, `/api/whatsapp/communities/${encodeURIComponent(communityJid)}`);
}

export async function getCommunityInvite(apiKey: string, communityJid: string): Promise<CommunityInvite> {
  return watobotFetch(apiKey, `/api/whatsapp/communities/${encodeURIComponent(communityJid)}/invite`);
}

export async function sendMessage(apiKey: string, to: string, message: string): Promise<void> {
  await watobotFetch(apiKey, "/api/message", {
    method: "POST",
    body: JSON.stringify({to, message}),
  });
}

// WhatsApp jids/lids are `<digits>@s.whatsapp.net` or `<digits>@lid`. Phone
// numbers collected on the form are compared against the leading digits of
// each participant id, since we don't otherwise know which id format a
// given community will report a member under.
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function participantMatchesPhone(participant: CommunityParticipant, phone: string): boolean {
  const digits = phoneDigits(phone);
  return digits.length > 0 && participant.id.startsWith(digits);
}
