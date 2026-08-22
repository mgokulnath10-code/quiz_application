import { Navigate } from "react-router-dom";

function AdminProtectedRoute({
  children,
}) {

  const isAdmin =
    localStorage.getItem(
      "adminLoggedIn"
    ) === "true";

  return isAdmin
    ? children
    : <Navigate to="/admin-login" />;
}

export default AdminProtectedRoute;