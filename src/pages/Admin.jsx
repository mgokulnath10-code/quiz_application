import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  FiHome,
  FiLogOut,
  FiBarChart2,
  FiGrid,
  FiPlus,
  FiTrash2,
  FiEdit2,
} from "react-icons/fi";
import {
  getAdminAuth,
  handleAdminError,
  clearAdminSession,
} from "../utils/adminAuth";
import "../styles/Admin.css";

const API = "https://brain-race.onrender.com";

function Admin() {
  const navigate = useNavigate();

  const [question, setQuestion] = useState("");
  const [option1, setOption1] = useState("");
  const [option2, setOption2] = useState("");
  const [option3, setOption3] = useState("");
  const [option4, setOption4] = useState("");
  const [answer, setAnswer] = useState("");

  const [questions, setQuestions] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [editQuestion, setEditQuestion] = useState("");

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await axios.get(
        `${API}/api/questions`,
        getAdminAuth()
      );

      setQuestions(res.data);
    } catch (error) {
      if (!handleAdminError(error, navigate)) {
        console.error(error);
      }
    }
  };

  const logout = () => {
    clearAdminSession();

    navigate("/admin-login");
  };

  const saveQuestion = async () => {
    if (!question || !option1 || !option2 || !option3 || !option4 || !answer) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      await axios.post(
        `${API}/api/questions`,
        {
          question,
          options: [option1, option2, option3, option4],
          answer,
        },
        getAdminAuth()
      );

      setQuestion("");
      setOption1("");
      setOption2("");
      setOption3("");
      setOption4("");
      setAnswer("");

      fetchQuestions();
    } catch (error) {
      console.error(error);
    }
  };

  const deleteQuestion = async (id) => {
    const confirmDelete = window.confirm("Delete this question?");

    if (!confirmDelete) return;

    try {
      await axios.delete(
        `${API}/api/questions/${id}`,
        getAdminAuth()
      );

      fetchQuestions();
    } catch (error) {
      if (!handleAdminError(error, navigate)) {
        console.error(error);
      }
    }
    };

  const startEdit = (questionObj) => {
    setEditingId(questionObj._id);
    setEditQuestion(questionObj.question);
  };

  const updateQuestion = async () => {
    try {
      await axios.put(
        `${API}/api/questions/${editingId}`,
        { question: editQuestion },
        getAdminAuth()
      );

      setEditingId(null);
      setEditQuestion("");

      fetchQuestions();
    } catch (error) {
      if (!handleAdminError(error, navigate)) {
        console.error(error);
      }
    }
  };

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Admin dashboard</h1>

            <p className="page-subtitle">
              Manage the global question bank and platform data.
            </p>
          </div>

          <div className="row">
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/admin-stats")}
            >
              <FiBarChart2 />
              Analytics
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => navigate("/admin-rooms")}
            >
              <FiGrid />
              Rooms
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => navigate("/results")}
            >
              Results
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => navigate("/")}
            >
              <FiHome />
              Home
            </button>

            <button className="btn btn-danger-soft" onClick={logout}>
              <FiLogOut />
              Log out
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Add a new question</h3>

          <p className="card-desc">
            Questions added here appear in the global quiz for everyone.
          </p>

          <div className="grid-2">
            <div className="field">
              <label>Question</label>

              <input
                className="input"
                type="text"
                placeholder="e.g. Which language runs in a browser?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Correct answer</label>

              <input
                className="input"
                type="text"
                placeholder="Must match one of the options exactly"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>
          </div>

          <div className="options-grid">
            <div className="field">
              <label>Option 1</label>

              <input
                className="input"
                type="text"
                value={option1}
                onChange={(e) => setOption1(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Option 2</label>

              <input
                className="input"
                type="text"
                value={option2}
                onChange={(e) => setOption2(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Option 3</label>

              <input
                className="input"
                type="text"
                value={option3}
                onChange={(e) => setOption3(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Option 4</label>

              <input
                className="input"
                type="text"
                value={option4}
                onChange={(e) => setOption4(e.target.value)}
              />
            </div>
          </div>

          <button className="btn btn-primary" onClick={saveQuestion}>
            <FiPlus />
            Save question
          </button>
        </div>

        <div className="card">
          <h3 className="card-title">
            Question bank
          </h3>

          <p className="card-desc">
            {questions.length} question{questions.length === 1 ? "" : "s"} in the global quiz.
          </p>

          {questions.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <FiPlus />
              </span>

              <p>No questions yet. Add the first one above.</p>
            </div>
          ) : (
            questions.map((q) => (
              <div className="question-item" key={q._id}>
                {editingId === q._id ? (
                  <div className="question-edit">
                    <input
                      className="input"
                      value={editQuestion}
                      onChange={(e) => setEditQuestion(e.target.value)}
                    />

                    <div className="row">
                      <button className="btn btn-primary btn-sm" onClick={updateQuestion}>
                        Save changes
                      </button>

                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditingId(null);
                          setEditQuestion("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="question-item-body">
                      <h4>{q.question}</h4>

                      <div className="question-options">
                        {q.options.map((option, index) => (
                          <span
                            key={index}
                            className={`question-option ${
                              option === q.answer ? "correct" : ""
                            }`}
                          >
                            {option}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="row">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => startEdit(q)}
                      >
                        <FiEdit2 />
                        Edit
                      </button>

                      <button
                        className="btn btn-danger-soft btn-sm"
                        onClick={() => deleteQuestion(q._id)}
                      >
                        <FiTrash2 />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}

export default Admin;
