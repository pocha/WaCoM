import {setGlobalOptions} from "firebase-functions/v2";
import {Agent, setGlobalDispatcher} from "undici";
import "./admin";

// Matches the Firestore database's region (asia-south1) to avoid
// cross-region latency between Functions and Firestore.
setGlobalOptions({region: "asia-south1"});

// Local Watobot instances are commonly served over HTTPS with a certificate
// the emulator's Node process can't chain to a trusted root (e.g. a
// Let's Encrypt cert without its intermediate installed locally). Only ever
// set WATOBOT_INSECURE_TLS in functions/.env.local — never in functions/.env
// — since this disables certificate verification for every outgoing fetch.
if (process.env.WATOBOT_INSECURE_TLS === "true") {
  setGlobalDispatcher(new Agent({connect: {rejectUnauthorized: false}}));
}

export {validateAndSignIn} from "./auth";
export {listMyCommunities, onboardCommunity} from "./communities";
export {createForm, submitApplication} from "./forms";
export {approveApplicant, rejectApplicant} from "./applicants";
export {hourlyJoinCheck} from "./cron";
