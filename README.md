# WaCoM — WhatsApp Community Manager

Entry Gatekeeping (v1): mods paste a permanent Watobot API key, onboard a
WhatsApp Community they administer, build an application form, and review/
approve applicants — approval sends a WhatsApp invite via Watobot, and an
hourly job confirms once the applicant has actually joined.

## Architecture

- `public/` — static frontend, deployed to GitHub Pages.
- `functions/` — Firebase Cloud Functions (TypeScript) backend.
- `firestore.rules` / `firestore.indexes.json` — Firestore schema/security.

Auth: mods sign in by pasting a Watobot API key, which `validateAndSignIn`
verifies against Watobot and exchanges for a Firebase Auth custom token
(uid = `wa_<phoneNumber>`), so Firestore rules can scope community/applicant
access to `request.auth.uid`.

## One-time setup

1. Create a Firebase project, enable Firestore, Authentication (no sign-in
   providers need enabling — custom tokens don't require one), and Cloud
   Functions (2nd gen).
2. Fill in `public/assets/firebase-config.js` with the project's web app
   config, and `.firebaserc`'s `default` project id.
3. Set the API-key encryption secret:
   `firebase functions:secrets:set API_KEY_ENCRYPTION_KEY` (any random
   32+ byte value, e.g. `openssl rand -hex 32`).
4. If Watobot isn't at `https://watobot.xyz`, set
   `firebase functions:config:set` or pass `WATOBOT_API_BASE` as a param
   at deploy time.
5. For CI (`.github/workflows/deploy.yml`), add repo secrets
   `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` (a service account
   JSON key with Firebase Admin permissions).

## Local development

```
cd functions && npm install
firebase emulators:start --only functions,firestore,auth
```

Serve `public/` with any static file server (e.g. `npx serve public`) and
point `public/assets/wacom.js`'s Functions/Firestore clients at the
emulator (`connectFunctionsEmulator`/`connectFirestoreEmulator`) while
testing locally.

## Deploy

- Frontend: pushes to `main` publish `public/` to GitHub Pages.
- Backend: pushes to `main` deploy Firestore rules/indexes and Functions.
