// Auth header for the endpoints that accept either identity — the
// backend's userOrAdminAuth treats a `Bearer ` header as the admin
// guard and anything else as a signed-in user's raw token. The
// platform results list (/api/results) is the one shared route today.
//
// An admin session never sets `token`, and a user session never sets
// `adminToken`, so the two roles cannot be confused.

export const getResultsAuth = () => {
  const userToken = localStorage.getItem("token");

  if (userToken) {
    return { headers: { Authorization: userToken } };
  }

  const adminToken = localStorage.getItem("adminToken");

  if (adminToken) {
    return { headers: { Authorization: `Bearer ${adminToken}` } };
  }

  return { headers: {} };
};
