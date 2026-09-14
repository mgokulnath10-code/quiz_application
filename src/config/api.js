// Single source of truth for the backend API base URL.
//
// Production is a single Render web service: the Express backend also serves
// the built SPA from dist/, so the frontend and the API share one origin.
// Leaving VITE_API_BASE_URL unset therefore resolves to a RELATIVE base, so
// every request becomes `/api/...` against whatever origin served the page.
// There is no hardcoded host to keep in sync with the deployment.
//
// Local development runs two processes: Vite on http://localhost:5173 and the
// backend on http://localhost:5000. Set VITE_API_BASE_URL=http://localhost:5000
// in .env.local so the dev server talks to your local backend (see
// .env.example). Without it the dev server calls its own origin and hits
// Vite's 404 instead of the API.
//
// SECURITY: this variable is public. Vite inlines VITE_* values into the
// browser bundle, so never put a secret, key, or token here.

const configured = import.meta.env.VITE_API_BASE_URL;

// Empty base means "same origin as the page". Trailing slashes are stripped
// so `${API}/api/...` never produces a double slash.
export const API_BASE = (
  configured && configured.trim() ? configured.trim() : ""
).replace(/\/+$/, "");

// Display-safe origin for operator-facing diagnostics UI. `${API_BASE}`
// renders as an empty string when frontend and backend share an origin, so
// those screens use this label instead. The page origin is public
// information by definition.
export const API_ORIGIN = API_BASE || window.location.origin;

const API = API_BASE;

export default API;