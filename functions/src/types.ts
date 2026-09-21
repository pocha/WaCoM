export interface ModDoc {
  api_key: string;
  provider: "watobot";
  phone_number: string;
  name: string;
  // Community jids Watobot has verified this account as admin of, written
  // only by listMyCommunities — firestore.rules gates direct client writes
  // to Communities/{jid} on this field, so it must never be client-settable.
  communities?: string[];
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}

export interface CommunityDoc {
  name: string;
  pictureUrl: string | null;
  mods: string[];
  onboarded_at: FirebaseFirestore.Timestamp;
}

export interface FormQuestion {
  id: string;
  label: string;
  required: boolean;
}

export interface FormDoc {
  communityName: string;
  communityPictureUrl: string | null;
  questions: FormQuestion[];
  active: boolean;
  created_by: string;
  created_at: FirebaseFirestore.Timestamp;
}

export type ApplicantStatus = "applied" | "rejected" | "pending_join" | "joined";

export interface ApplicantDoc {
  formId: string;
  phone: string;
  answers: Record<string, string>;
  questions: FormQuestion[];
  status: ApplicantStatus;
  applied_at: FirebaseFirestore.Timestamp;
  approved_by?: string;
  approved_by_name?: string;
  invited_at?: FirebaseFirestore.Timestamp;
  rejected_by?: string;
  rejected_by_name?: string;
  rejected_at?: FirebaseFirestore.Timestamp;
  joined_at?: FirebaseFirestore.Timestamp;
}
