import {setGlobalOptions} from "firebase-functions/v2";
import "./admin";

// Matches the Firestore database's region (asia-south1) to avoid
// cross-region latency between Functions and Firestore.
setGlobalOptions({region: "asia-south1"});

export {validateAndSignIn} from "./auth";
export {listMyCommunities, onboardCommunity} from "./communities";
export {createForm, submitApplication} from "./forms";
export {approveApplicant, rejectApplicant} from "./applicants";
export {hourlyJoinCheck} from "./cron";
