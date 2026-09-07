// Shared helpers for authenticated admin API calls.

export const getAdminAuth = () => ({
  headers: {
    Authorization: `Bearer ${
      localStorage.getItem("adminToken") || ""
    }`,
  },
});

// On 401/403 the admin session is invalid or
// expired — clear it and return to login.

export const handleAdminError = (error, navigate) => {
  if (
    error.response?.status === 401 ||
    error.response?.status === 403
  ) {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminLoggedIn");
    localStorage.removeItem("isAdmin");

    if (navigate) navigate("/admin-login");

    return true;
  }

  return false;
};

export const clearAdminSession = () => {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminLoggedIn");
  localStorage.removeItem("isAdmin");
};
