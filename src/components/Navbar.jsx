import { Link, useNavigate } from "react-router-dom";
import { FiZap, FiLogOut } from "react-icons/fi";
import "../styles/Navbar.css";

function Navbar() {
  const navigate = useNavigate();

  const isLoggedIn =
    localStorage.getItem("isLoggedIn") === "true";

  const user =
    JSON.parse(localStorage.getItem("user")) || {};

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("token");
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminLoggedIn");
    localStorage.removeItem("isAdmin");

    navigate("/");
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">

        <Link to="/" className="brand">
          <span className="brand-mark">
            <FiZap />
          </span>
          <span className="brand-name">
            BrainRace
          </span>
        </Link>

        <div className="nav-links">
          {isLoggedIn ? (
            <>
              <Link to="/rooms" className="nav-link">
                Rooms
              </Link>

              <Link to="/leaderboard" className="nav-link">
                Leaderboard
              </Link>

              <Link to="/results" className="nav-link">
                Results
              </Link>

              <Link to="/profile" className="nav-link">
                Profile
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">
                Log in
              </Link>

              <Link to="/register" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </>
          )}
        </div>

        {isLoggedIn && (
          <div className="nav-user">
            <span className="nav-avatar">
              {(user.name || "U").charAt(0).toUpperCase()}
            </span>

            <span className="nav-username">
              {user.name || "User"}
            </span>

            <button
              className="btn btn-ghost btn-sm"
              onClick={logout}
              title="Log out"
            >
              <FiLogOut />
            </button>
          </div>
        )}

      </div>
    </nav>
  );
}

export default Navbar;
