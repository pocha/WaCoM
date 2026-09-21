# Watomod — WhatsApp Community Manager

Entry Gatekeeping (v1): mods paste a permanent Watobot API key, onboard a
WhatsApp Community they administer, build an application form, and review/
approve applicants — approval sends a WhatsApp invite via Watobot, and an
hourly job confirms once the applicant has actually joined.

## Architecture

- `views/pages/` + `views/partials/` — page sources, expanded by
  `scripts/build-pages.js` into `public/dashboard.html` and
  `public/community/gate-keeping.html` (both gitignored — build output, not
  source). `index.html` and `form.html` in `public/` are plain, unbuilt
  static files. `public/serve.json` rewrites `/community/:id/gate-keeping`
  to that one built file (Community tabs: Gatekeeping live, Inactive
  Members disabled placeholder).
- `public/assets/` — shared client code: `wacom.js` (Firebase init, auth
  helpers, direct-to-Watobot fetch helper), `firebase-config.js` (public,
  non-secret Firebase web app config, committed), `watobot-config.js`
  (gitignored — see below), `theme.css` / `theme.js` (Watobot's own design
  tokens, copied).
- `functions/` — Firebase Cloud Functions (TypeScript), deliberately small
  — see "Why so few Functions" below.
- `firestore.rules` / `firestore.indexes.json` — Firestore schema/security.

### Auth

Mods sign in by pasting a Watobot API key (plus a display name). `validateAndSignIn`
verifies the key against Watobot, resolves the mod's real WhatsApp phone
number, and mints a Firebase Auth custom token for uid `wa_<phoneNumber>` —
that uid also doubles as the `Mods/{uid}` doc id. The key itself is stored
as-is in `Mods/{uid}.api_key` (not encrypted): a compromised key can just be
rotated in Watobot, and the doc is locked down (see below) regardless.

### Why so few Functions

Only four: `validateAndSignIn` (mints a custom token — only the Admin SDK
can do that), `listMyCommunities`, `submitApplication` (validates and
deduplicates an anonymous public submission), and `hourlyJoinCheck` (cron).
Onboarding a community, creating a form, and approving/rejecting an
applicant are all **direct client Firestore writes** plus, where needed, a
**direct browser call to Watobot** — Watobot allows cross-origin requests
from anywhere (`@fastify/cors` with `origin: true`), so there's no
same-origin/CORS reason to proxy those calls through a Function.

This works because of one piece of server-verified state: `listMyCommunities`
calls Watobot (using the mod's own `api_key`, which a client is trusted to
read but never write) and persists the resulting admin-community jids into
`Mods/{uid}.communities`. That field is never client-writable, so
`firestore.rules` can safely gate a client's write to `Communities/{jid}` on
`jid in Mods/{request.auth.uid}.communities` — the client can't forge an
admin claim for a community it was never actually verified against. Forms
and Applicants writes are gated more simply, on `request.auth.uid` already
being in the parent `Communities/{jid}.mods` array.

`listMyCommunities` also fetches each community's `pictureUrl` and
`inviteLink` from Watobot (one combined `community-info` call per
community, piggybacking on the mudslide connection it already opens) and
caches them onto the `Communities/{jid}` doc. Onboarding and approving an
applicant both just read that cached value instead of calling Watobot
again — the only client-side Watobot call left is sending the approval
WhatsApp message itself. Clicking "Load All My Communities" on the
dashboard re-runs `listMyCommunities` and refreshes the cache if the
picture or invite link changed.

`Mods/{uid}` itself is owner-**read**-only, never client-writable at all —
a client can read its own `api_key`/`name`/`communities` (needed for the
direct Watobot calls and to stamp `approved_by_name`/`rejected_by_name`
without a lookup into another mod's otherwise-locked doc), but only a
Function (Admin SDK) can ever write to it.

## One-time setup (production)

1. Create a Firebase project, enable Firestore, Authentication (no sign-in
   providers need enabling — custom tokens don't require one), and Cloud
   Functions (2nd gen).
2. Fill in `public/assets/firebase-config.js` with the project's web app
   config, and `.firebaserc`'s `default` project id.
3. `functions/.env` sets `WATOBOT_API_BASE` for production Function calls.
   `public/assets/watobot-config.js` (gitignored) is generated from that
   same value by `scripts/build-pages.js` — see "Local development" below —
   so there's nothing separate to keep in sync here.
4. GitHub Pages: repo Settings → Pages → set the source to "GitHub
   Actions" (`gh api -X PUT repos/<owner>/<repo>/pages -f build_type=workflow`
   — the classic "deploy from a branch" source only supports serving `/` or
   `/docs`, not `/public`, which is why this repo doesn't use it). If a
   custom domain is attached, pass `-f cname=<domain>` in that same call so
   it isn't dropped.
5. GitHub Actions secrets for `deploy-firebase` in `.github/workflows/deploy.yml`
   (repo Settings → Secrets and variables → Actions, or `gh secret set`):
   - `FIREBASE_PROJECT_ID` — the Firebase project id (e.g. `wacom-app`).
   - `FIREBASE_SERVICE_ACCOUNT` — the full JSON of a service account key
     (Firebase Console → Project Settings → Service Accounts → Generate new
     private key). Set with: `gh secret set FIREBASE_SERVICE_ACCOUNT < path/to/key.json`.
     Never commit this file.
6. That service account needs more than its default
   `firebase.sdkAdminServiceAgent` role to run `firebase deploy` — grant, on
   the GCP project:
   - `roles/editor` (project-level) — covers Cloud Functions/Cloud Build/
     Artifact Registry and checking API-enablement status.
   - `roles/firebase.admin` (project-level) — covers the Firebase Rules API
     (`firebaserules.googleapis.com`), not included in `roles/editor`.
   - `roles/iam.serviceAccountUser`, scoped to
     `<project-id>@appspot.gserviceaccount.com` specifically — Cloud
     Functions (2nd gen) deploys run *as* that service account, so the
     deploying identity needs to "act as" it.
   ```
   gcloud projects add-iam-policy-binding <project-id> \
     --member="serviceAccount:<sa-email>" --role="roles/editor" --condition=None
   gcloud projects add-iam-policy-binding <project-id> \
     --member="serviceAccount:<sa-email>" --role="roles/firebase.admin" --condition=None
   gcloud iam service-accounts add-iam-policy-binding <project-id>@appspot.gserviceaccount.com \
     --member="serviceAccount:<sa-email>" --role="roles/iam.serviceAccountUser"
   ```

Both secrets and all three IAM bindings are already set for this repo
(`pocha/WaCoM` → Firebase project `wacom-app`).

## Local development

```
npm install
cd functions && npm install && cd ..
npm start
```

`npm start` builds `views/pages/` → `public/` (including generating
`public/assets/watobot-config.js`, see below) and the Functions once
(`prestart`), then runs the Firebase Emulator Suite (Firestore on :8080,
Functions on :5501, Auth on :9099, emulator UI on :4700) alongside a static
server for `public/` on **http://localhost:5002**. `public/assets/wacom.js`
auto-detects `localhost` and points the Firebase client SDK at the
emulators instead of the real project, so no `firebase-config.js` edits are
needed for local testing.

Functions runs on :5501 instead of the Firebase default :5001, and the
emulator UI on :4700 instead of :4000, because a local Watobot checkout
(needed alongside this repo for end-to-end testing — see below) runs its
own Functions emulator on the default :5001. Both repos' Firestore/Auth
emulators stay on the defaults since Watobot's `npm start` only ever
starts `--only functions`.

Point your local Watobot instance in exactly one place:
`functions/.env.local` — `WATOBOT_API_BASE=https://localhost` (or whatever
port/scheme your local Watobot uses). Gitignored, loaded only by the
emulator, never on deploy. `scripts/build-pages.js` (run by `prestart`)
reads that same value — layered over `functions/.env`, exactly like the
Functions emulator itself does — and writes it into
`public/assets/watobot-config.js`, so the browser's direct-to-Watobot
calls and the Functions emulator's calls always agree on which Watobot
they're hitting. Don't hand-edit or commit `watobot-config.js` — it's
regenerated on every `npm start`/deploy and gitignored.

If your local Watobot serves HTTPS with a certificate the emulator's Node
process can't chain-verify (e.g. a bare Let's Encrypt cert), also set
`functions/.env.local`'s `WATOBOT_INSECURE_TLS=true` — never set that in
`functions/.env`. This only affects the Functions emulator's own fetch
calls; the browser's calls go through Chrome's own certificate handling.

### What else you need running

- **A local Watobot server** on the `communities-support` branch, with the
  community routes (`GET /api/whatsapp/communities`, `.../:jid`) actually
  present — i.e. built from the branch this repo depends on, not `main`.
  `.../:jid` returns `pictureUrl` and `inviteLink` together (mudslide's
  `community-info` fetches both in one WhatsApp connection — there's no
  separate invite-fetch route).
- **That Watobot account logged into WhatsApp** (QR-scanned) with a
  **permanent** API key generated (`POST /api/apikey/generate` then made
  permanent) — a 1-hour key will expire mid-testing.
- **The mudslide `community-support` branch built** and wired up as the
  binary Watobot's `mudslideService.js` shells out to, since that's where
  the actual `communities`/`community-info` commands live.
- **A real WhatsApp Community** that account administers, to onboard and
  test the form/approval flow against.

Nothing else — no GCP credentials, no service account, no login — is
needed for the emulator path; it never talks to the real Firebase project.

## Tests

`npm test` runs `functions/test/gatekeeping.test.ts` (vitest) inside
`firebase emulators:exec --only firestore,auth`, which starts a throwaway
Firestore + Auth emulator, runs the suite, then tears it down. No Watobot
or WhatsApp needed — every Watobot call is mocked (`functions/test/watobotMock.ts`).

The suite is two `describe` blocks of tests that run in declared order and
share Firestore state across the whole file (not independent/isolated
tests) — it walks one mod (Alice) through sign-in → onboarding → form
creation → a public submission → approval → the hourly join-check cron,
then a second mod (Bob) joining that same already-onboarded community,
editing the form, and rejecting a separate applicant. "Client steps" (the
direct Firestore writes dashboard.html/community-gate-keeping.html make)
are inlined via `@firebase/rules-unit-testing`'s rules-enforced Firestore
client rather than by loading the actual HTML/JS, so the suite verifies
the firestore.rules + Functions contract those pages rely on, not the DOM
code itself.

One non-obvious gotcha if you extend this suite: `firebase emulators:exec`
sets `FIREBASE_CONFIG` in the child process to the real `.firebaserc`
project (`wacom-app`), and firebase-admin's `initializeApp()` prefers that
over any `GCLOUD_PROJECT` override — so the test file reads the admin
SDK's actually-resolved `projectId` back out and hands that same id to
`initializeTestEnvironment`, rather than hardcoding one. Passing mismatched
project ids to the two SDKs doesn't error — they just silently write to two
separate empty namespaces in the same emulator, and every rule's
`get()`/`exists()` cross-doc lookup then evaluates against `null`.

## Deploy

Both triggered by a push to `main` (`.github/workflows/deploy.yml`):

- **Frontend**: `deploy-pages` builds `views/pages/` → `public/`
  (`scripts/build-pages.js`), then publishes `public/` straight from that
  workflow run via GitHub's native Pages Actions flow (`configure-pages`
  / `upload-pages-artifact` / `deploy-pages`) — no `gh-pages` branch
  involved.
- **Backend**: `deploy-firebase` builds `functions/` and deploys Firestore
  rules/indexes and Cloud Functions to the project named by the
  `FIREBASE_PROJECT_ID` secret, authenticating with `FIREBASE_SERVICE_ACCOUNT`
  (see the IAM roles it needs, above).
