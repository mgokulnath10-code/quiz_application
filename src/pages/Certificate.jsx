import { useLocation, useNavigate } from "react-router-dom";
import { useRef } from "react";
import html2canvas from "html2canvas";
import "../styles/Certificate.css";

function Certificate() {
  const location = useLocation();
  const navigate = useNavigate();

  const certificateRef = useRef();

  const user =
    JSON.parse(localStorage.getItem("user")) ||
    { name: "Guest" };

  const score = location.state?.score || 0;
  const total = location.state?.total || 0;

  const percentage =
    total > 0
      ? Math.round((score / total) * 100)
      : 0;

  const downloadCertificate = async () => {
    const canvas = await html2canvas(
      certificateRef.current,
      {
        scale: 3,
        useCORS: true,
      }
    );

    const image =
      canvas.toDataURL("image/png");

    const link =
      document.createElement("a");

    link.href = image;
    link.download =
      `${user.name}-Certificate.png`;

    link.click();
  };

  return (
    <div className="certificate-page">

      <div className="certificate-header">

        <button
          className="home-btn"
          onClick={() => navigate("/")}
        >
          🏠 Home
        </button>

      </div>

      <div
        className="certificate-card"
        ref={certificateRef}
      >

        <div className="certificate-border">

          <h1 className="certificate-title">
            Certificate of Achievement
          </h1>

          <p className="certificate-subtitle">
            This certificate is proudly presented to
          </p>

          <h2 className="student-name">
            {user.name}
          </h2>

          <p className="certificate-text">
            For successfully completing the
            BrainRace Quiz Challenge with
            outstanding performance.
          </p>

          <div className="certificate-score-section">

            <div className="score-box">
              <h3>Score</h3>
              <p>
                {score} / {total}
              </p>
            </div>

            <div className="score-box">
              <h3>Percentage</h3>
              <p>{percentage}%</p>
            </div>

          </div>

          <div className="certificate-footer">

            <div className="signature-box">
              <hr />
              <p>BrainRace Platform</p>
            </div>

            <div className="signature-box">
              <hr />
              <p>
                {new Date().toLocaleDateString()}
              </p>
            </div>

          </div>

        </div>

      </div>

      <div className="certificate-actions">

        <button
          className="download-btn"
          onClick={downloadCertificate}
        >
          📥 Download Certificate
        </button>

      </div>

    </div>
  );
}

export default Certificate;