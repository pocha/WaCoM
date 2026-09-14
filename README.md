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
access to `request.auth.uid`. The key is stored as-is in `Mods/{lid}.api_key`
— not encrypted — since Firestore rules already deny all client access to
that collection, and a compromised key can just be rotated in Watobot.

There are currently no secrets required anywhere in this project. The only
externally-configurable value is `WATOBOT_API_BASE` (not a secret — just
which Watobot server to call), set via `functions/.env` (production) or
`functions/.env.local` (local emulator override, gitignored).

## One-time setup (production)

1. Create a Firebase project, enable Firestore, Authentication (no sign-in
   providers need enabling — custom tokens don't require one), and Cloud
   Functions (2nd gen).
2. Fill in `public/assets/firebase-config.js` with the project's web app
   config, and `.firebaserc`'s `default` project id.
3. `functions/.env` sets `WATOBOT_API_BASE` for production deploys.
4. For CI (`.github/workflows/deploy.yml`), add repo secrets
   `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` (a service account
   JSON key with Firebase Admin permissions).

Not covered by this doc yet: actually deploying to production — hold off
until local testing below passes.

## Local development

```
npm install
cd functions && npm install && cd ..
npm start
```

`npm start` builds the Functions once, then runs the Firebase Emulator
Suite (Firestore on :8080, Functions on :5001, Auth on :9099, emulator UI
on :4000 by default) alongside a static server for `public/` on
http://localhost:5000. `public/assets/wacom.js` auto-detects `localhost`
and points the Firebase client SDK at the emulators instead of the real
project, so no `firebase-config.js` edits are needed for local testing.

Before running, edit `functions/.env.local` to point at your local Watobot
instance (`WATOBOT_API_BASE=http://localhost:<PORT>`, matching whatever
`PORT` Watobot's `.env` uses). It's loaded only by the emulator, never on
deploy.

### What else you need running

- **A local Watobot server** on the `communities-support` branch, with the
  new community routes (`GET /api/whatsapp/communities`, `.../:jid`,
  `.../:jid/invite`) actually present — i.e. built from the branch this
  repo depends on, not `main`.
- **That Watobot account logged into WhatsApp** (QR-scanned) with a
  **permanent** API key generated (`POST /api/apikey/generate` then made
  permanent) — a 1-hour key will expire mid-testing.
- **The mudslide `community-support` branch built** and wired up as the
  binary Watobot's `mudslideService.js` shells out to, since that's where
  the actual `communities`/`community-info`/`community-invite` commands
  live.
- **A real WhatsApp Community** that account administers, to onboard and
  test the form/approval flow against.

Nothing else — no GCP credentials, no service account, no login — is
needed for the emulator path; it never talks to the real Firebase project.

## Deploy

- Frontend: pushes to `main` publish `public/` to GitHub Pages.
- Backend: pushes to `main` deploy Firestore rules/indexes and Functions.
