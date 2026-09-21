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
  phoneNumber: string | null;
}

export interface CommunityInfo {
  id: string;
  subject: string;
  pictureUrl: string | null;
  participants: CommunityParticipant[];
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
  const {communities} = await watobotFetch(apiKey, "/api/whatsapp/communities?adminOnly=true");
  return communities;
}

export async function getCommunityInfo(apiKey: string, communityJid: string): Promise<CommunityInfo> {
  return watobotFetch(apiKey, `/api/whatsapp/communities/${encodeURIComponent(communityJid)}`);
}

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function participantMatchesPhone(participant: CommunityParticipant, phone: string): boolean {
  if (!participant.phoneNumber) return false;
  return phoneDigits(participant.phoneNumber) === phoneDigits(phone);
}
