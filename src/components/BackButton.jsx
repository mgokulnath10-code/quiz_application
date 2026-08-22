import { useNavigate } from "react-router-dom";

function BackButton({
  path = "/",
  text = "← Back",
}) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(path)}
    >
      {text}
    </button>
  );
}

export default BackButton;