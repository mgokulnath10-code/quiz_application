import { Link, useNavigate } from "react-router-dom";
import "../styles/Navbar.css";

function Navbar() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("adminLoggedIn");

    navigate("/");
  };

  return (
    <nav className="navbar">

      <div className="logo">
        🧠 BrainRace
      </div>

      <ul className="nav-links">
        <li>
          
        </li>

        <li>
          
        </li>

        <li>
          
        </li>

      </ul>

     
    </nav>
  );
}

export default Navbar;