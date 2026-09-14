import { Navigate } from "react-router-dom";

// User-token-only by default: the user-specific pages (/dashboard,
// /profile, ...) call APIs the admin token cannot answer. Routes whose
// API accepts either identity (the backend's userOrAdminAuth) pass
// `allowAdmin` so the signed-in administrator gets through too.
function ProtectedRoute({ children, allowAdmin = false }) {
  const token = localStorage.getItem("token");

  const adminToken = localStorage.getItem("adminToken");

  if (!token && !(allowAdmin && adminToken)) {
    return <Navigate to="/" />;
  }

  return children;
}

export default ProtectedRoute;
