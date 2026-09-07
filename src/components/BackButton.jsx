import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

function BackButton({ path = "/", text = "Back" }) {
  const navigate = useNavigate();

  return (
    <button
      className="btn btn-secondary"
      onClick={() => navigate(path)}
    >
      <FiArrowLeft />
      {text}
    </button>
  );
}

export default BackButton;
