// Single source of truth for the backend API base URL.
//
// Read from VITE_API_BASE_URL (see .env.example) so the frontend can be
// pointed at any backend without editing code. Local development sets it to
// http://localhost:5000 in .env.local.
//
// When the variable is unset or blank the deployed backend below is used,
// which is exactly what the production build relies on.

const DEFAULT_API = "https://brain-race.onrender.com";

const configured = import.meta.env.VITE_API_BASE_URL;

const API = (
  configured && configured.trim() ? configured.trim() : DEFAULT_API
).replace(/\/+$/, "");

export default API;
