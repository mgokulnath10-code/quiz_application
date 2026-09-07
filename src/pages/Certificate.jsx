import { useLocation, useNavigate } from "react-router-dom";
import { useRef } from "react";
import html2canvas from "html2canvas";
import { FiDownload, FiHome } from "react-icons/fi";
import "../styles/Certificate.css";

function Certificate() {
  const location = useLocation();
  const navigate = useNavigate();

  const certificateRef = useRef();

  const user =
    JSON.parse(localStorage.getItem("user")) || { name: "Guest" };

  const score = location.state?.score || 0;
  const total = location.state?.total || 0;

  const percentage =
    total > 0 ? Math.round((score / total) * 100) : 0;

  const downloadCertificate = async () => {
    const canvas = await html2canvas(certificateRef.current, {
      scale: 3,
      useCORS: true,
    });

    const image = canvas.toDataURL("image/png");

    const link = document.createElement("a");

    link.href = image;
    link.download = `${user.name}-Certificate.png`;

    link.click();
  };

  return (
    <div className="page">
      <div className="page-inner narrow">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Certificate</h1>

            <p className="page-subtitle">
              Your achievement for this quiz attempt.
            </p>
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => navigate("/")}
          >
            <FiHome />
            Back to home
          </button>
        </div>

        <div
          className="certificate-card"
          ref={certificateRef}
        >
          <div className="certificate-inner">
            <div className="certificate-seal">
              BrainRace
            </div>

            <p className="certificate-kicker">
              Certificate of Achievement
            </p>

            <p className="certificate-presented">
              This certificate is proudly presented to
            </p>

            <h2 className="student-name">
              {user.name}
            </h2>

            <p className="certificate-text">
              for successfully completing the BrainRace
              Quiz Challenge with outstanding performance.
            </p>

            <div className="certificate-score-section">
              <div className="score-box">
                <span className="score-label">Score</span>
                <span className="score-value">{score} / {total}</span>
              </div>

              <div className="score-divider" />

              <div className="score-box">
                <span className="score-label">Percentage</span>
                <span className="score-value">{percentage}%</span>
              </div>
            </div>

            <div className="certificate-footer">
              <div className="signature-box">
                <div className="signature-line" />
                <p>BrainRace Platform</p>
              </div>

              <div className="signature-box">
                <div className="signature-line" />
                <p>{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="certificate-actions">
          <button
            className="btn btn-primary"
            onClick={downloadCertificate}
          >
            <FiDownload />
            Download certificate
          </button>
        </div>

      </div>
    </div>
  );
}

export default Certificate;
