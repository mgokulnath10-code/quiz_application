# BrainRace — Deployment Contract

Operational notes for deploying BrainRace. This file records **names and
purpose only**. It is committed, so it must never contain a secret, token,
credential, or environment value.

BrainRace deploys as **one Render web service** that serves two things:

- **Backend (API)** - the Express app in `backend/`, which owns every
  `/api/...` route.
- **Frontend (SPA)** - the Vite/React app in `src/`, built to `dist/` by the
  same build and served by that Express app from the same origin, with an SPA
  fallback for deep links (section 1).
- **Database** - MongoDB, reached only by the backend through `MONGO_URI`.

The frontend ships with a relative API base: requests become `/api/...`
against the origin that served the page, so there is no second host and no
cross-origin setup to maintain. `render.yaml` at the repository root declares
the single service (Render -> New -> Blueprint); `backend/server.js` mounts the
static SPA and its fallback at the bottom of the file. The separate static
hosting of the frontend (Vercel) that an earlier revision of this document
described has been retired.

## 1. SPA fallback (required for every deep link)

The app serves one HTML shell (`/index.html`) and routes in the browser:
`/login`, `/register`, `/forgot-password`, `/rooms`, `/quiz`, `/dashboard`,
`/leaderboard`, `/admin-login`, `/admin`, `/oauth/callback`, and the other
routes declared in `src/App.jsx`. A host that only matches files returns 404
for those paths unless it is told to fall back to the shell.

The Express app owns this fallback now. For any non-`/api` GET or HEAD that is
not a real file in `dist/`, `backend/server.js` returns `dist/index.html`; a
missing hashed asset under `/assets/...` answers 404 JSON instead of the shell
so a stale bundle fails clearly. Deep links, refreshes and the OAuth return
path therefore all resolve on the single Render origin with no host-specific
configuration. The former `vercel.json` rewrite and `public/_redirects` rule
were removed together with the separate static hosting they served.

## 2. Backend environment variables

The backend reads these from the process environment. They must be set in the
**host's dashboard** (on the Render service: Environment → Environment
Variables), never committed to the repository.

| Variable | Purpose | What breaks without it |
| --- | --- | --- |
| `MONGO_URI` | MongoDB connection string used by `backend/config/db.js`. | The API starts but never connects; every database-backed route (accounts, OTP, quiz, rooms, results, audit) fails. |
| `JWT_SECRET` | Signs and verifies the auth tokens issued after login/registration and the OAuth handoff. | Tokens cannot be signed or verified, so authenticated requests fail. |
| `ADMIN_USERNAME` | Admin identity checked by the admin sign-in endpoint. | Admin sign-in reports that no admin account is configured. |
| `ADMIN_PASSWORD` | Admin password checked by the admin sign-in endpoint. | Admin sign-in is unavailable and every `/admin*` page is unreachable. |
| `SMTP_HOST` | SMTP server host for OTP email (account verification, password reset). | With no `SMTP_*` set, OTP mail cannot be sent, so registration and password reset stall (unless `ALLOW_DEV_OTP` is enabled outside production). |
| `SMTP_PORT` | SMTP server port; port 465 selects implicit TLS. | The transporter cannot reach the mail server; OTP delivery fails. |
| `SMTP_USER` | SMTP authentication user. | Mail authentication fails; OTP delivery fails. |
| `SMTP_PASS` | SMTP authentication credential. | Mail authentication fails; OTP delivery fails. |
| `SMTP_FROM` | `From:` address on outgoing OTP mail; falls back to `BrainRace <SMTP_USER>`. | Without a verified sender address, mail may be rejected or filed as spam. |
| `RESEND_API_KEY` | API key for the Resend HTTPS email API. **Preferred in production** — see §2a. | Optional. Without it (and without a Brevo key) the server falls back to SMTP. |
| `BREVO_API_KEY` | API key for the Brevo HTTPS email API. Used only when no Resend key is set. | Optional; the second-choice HTTPS provider. |
| `EMAIL_FROM` | Transport-agnostic `From:` address for HTTPS mail — a verified sender on your provider domain, e.g. `BrainRace <no-reply@yourdomain>`. Falls back to `SMTP_FROM`. | Without a verified sender the provider rejects the send and the OTP routes answer `EMAIL_SEND_FAILED`. |
| `GOOGLE_CLIENT_ID` | Google OAuth client id. | The Google button is hidden and `/api/auth/google` answers `PROVIDER_NOT_CONFIGURED`; Google sign-in cannot start. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret for the token exchange. | Google sign-in starts but fails at the token exchange. |
| `SERVER_URL` | Public origin of the **backend**; used to build the OAuth `redirect_uri`. | OAuth sign-in answers `OAUTH_ORIGIN_NOT_CONFIGURED` unless the origin is otherwise allowlisted via `FRONTEND_URL` / `OAUTH_ALLOWED_ORIGINS`. |
| `FRONTEND_URL` | Public origin of the **frontend**; provider returns are sent to `FRONTEND_URL/oauth/callback`. | Sign-in can succeed but has nowhere safe to return the browser (503); OAuth and password-reset returns cannot land. |
| `OAUTH_ALLOWED_ORIGINS` *(optional)* | Extra comma-separated origins trusted for OAuth, e.g. preview deployments. | Optional. Without it, only `SERVER_URL`, `FRONTEND_URL`, and — outside production — loopback hosts are trusted. |
| `ALLOW_DEV_OTP` *(optional)* | When the literal `true` **and** `NODE_ENV` is not `production`, exposes the OTP in the API response for local development. | Optional. Leave unset in production so codes are never exposed. |

Additional social providers the backend supports. Set the pair for each
provider you actually enable; the purpose matches the Google pair:

| Variable | Purpose | What breaks without it |
| --- | --- | --- |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth client id and secret. | The Microsoft button is hidden and Microsoft sign-in cannot start. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth client id and secret. | The GitHub button is hidden and GitHub sign-in cannot start. |

Provided by the host rather than set by hand:

- `PORT` — the port the API listens on; the host injects it.
- `NODE_ENV` — must be `production` on the host so dev-only behaviour
  (trusting loopback OAuth origins, `ALLOW_DEV_OTP`) stays disabled.

**Template note.** There is no committed backend env template in the current
tree: `backend/.env` is gitignored, and a `backend/.env.example` was removed in
an earlier commit. The only committed env template today is the root
`.env.example`, and it documents the frontend-only `VITE_API_BASE_URL`. Treat
the host dashboard as the source of truth for the backend variables above, and
never commit their values.

### 2a. Email transport, and why Render's free tier needs HTTPS

Registration, the unverified-login path and password reset all send a one-time
code by email, so email delivery is on the critical path of sign-up.

**Render's free tier blocks outbound traffic to SMTP ports 25, 465 and 587**
(their documented free-tier limitation). Gmail SMTP uses port 587, so on a
free Render web service an SMTP send is dropped: it cannot succeed, and
without a bound it makes `/api/register` and `/api/forgot-password` appear to
hang. The backend therefore picks a transport at send time:

1. `RESEND_API_KEY` set → **Resend** over HTTPS.
2. else `BREVO_API_KEY` set → **Brevo** over HTTPS.
3. else `SMTP_*` set → **SMTP** (works locally; blocked on Render free tier).
4. else none — OTP mail cannot be sent (`ALLOW_DEV_OTP` may expose codes
   outside production instead).

When both HTTPS keys are present Resend wins. HTTPS works on the free tier, so
setting one provider key is the supported production configuration; `SMTP_*`
can stay set for local development and is simply not chosen.

SMTP stays fully working for local development. Its connection, greeting and
socket timeouts are bounded, plus a hard per-attempt deadline, so a blocked or
unreachable mail port fails in seconds with the normal `503 EMAIL_SEND_FAILED`
rather than hanging for minutes.

Operators can see which transport a server would use, by name only, at
`GET /api/health/config` → `emailTransport: "resend" | "brevo" | "smtp" |
"none"`. The endpoint never returns a key or credential.

**Alternative if you prefer to keep Gmail SMTP:** upgrade the Render instance
to a paid plan, which is not subject to the free-tier SMTP port block. No code
change is needed — leave `SMTP_*` set and leave the HTTPS keys unset.

`RESEND_BASE_URL` / `BREVO_BASE_URL` exist only as test hooks for
`npm run selfcheck:email` (they redirect the provider request to a local stub).
They must never be set in production.

## 3. OAuth redirect URIs to register

Register these **exact strings** with each provider. Only the origin of
`SERVER_URL` varies; the path is fixed at `/api/auth/<provider>/callback`
(see `backend/utils/oauthOrigin.js`). If `SERVER_URL` changes, every deployed
redirect URI changes with it, so keep it stable and register both the deployed
and local values.

| Provider | Where to register | Redirect URI |
| --- | --- | --- |
| Google | Google Cloud Console → OAuth client → Authorized redirect URIs | `https://<SERVER_URL host>/api/auth/google/callback` and `http://localhost:5000/api/auth/google/callback` |
| Microsoft | Entra app registration → Redirect URIs (Web) | `https://<SERVER_URL host>/api/auth/microsoft/callback` and `http://localhost:5000/api/auth/microsoft/callback` |
| GitHub | OAuth App → Authorization callback URL | `https://<SERVER_URL host>/api/auth/github/callback` and `http://localhost:5000/api/auth/github/callback` |

Notes:

- The `redirect_uri` must be byte-identical to the registered string or the
  provider rejects the request/token exchange.
- Local development also offers the loopback alias `http://127.0.0.1:5000/...`.
  Register whichever local host you actually browse from; some providers
  require the exact host.

## 4. OAuth return path

After the provider callback, the backend redirects the browser to:

```
<FRONTEND_URL>/oauth/callback?token=***&id=...&name=...&email=...
```

- With the single-service deployment, `FRONTEND_URL` and `SERVER_URL` are the
  same Render origin (see `render.yaml`), so the browser lands back on the site
  that started the sign-in.
- `/oauth/callback` is a client-side route with no file behind it, so it only
  resolves because of the SPA fallback in `backend/server.js` (section 1).
  Without it the return 404s and social sign-in can never complete.

## 5. Secrets

Keep every value out of this file and out of the repository. Set them in the
host dashboard: every backend variable on the single Render service. The
frontend needs no deployed value at all - with `VITE_API_BASE_URL` unset its
API base is relative, so production builds point at their own origin. `VITE_*`
values are inlined into the browser bundle, so they are public by definition.
