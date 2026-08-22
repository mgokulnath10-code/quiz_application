import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../styles/Admin.css";

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
  const [editQuestion, setEditQuestion] =
    useState("");

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/questions"
      );

      setQuestions(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const logout = () => {
    localStorage.removeItem(
      "adminLoggedIn"
    );

    localStorage.removeItem(
      "isAdmin"
    );

    alert(
      "✅ Admin Logout Successful!"
    );

    navigate("/admin-login");
  };

  const saveQuestion = async () => {
    if (
      !question ||
      !option1 ||
      !option2 ||
      !option3 ||
      !option4 ||
      !answer
    ) {
      alert("Fill all fields");
      return;
    }

    try {
      await axios.post(
        "http://localhost:5000/api/questions",
        {
          question,
          options: [
            option1,
            option2,
            option3,
            option4,
          ],
          answer,
        }
      );

      alert(
        "✅ Question Saved"
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

  const deleteQuestion = async (
    id
  ) => {
    const confirmDelete =
      window.confirm(
        "Delete this question?"
      );

    if (!confirmDelete) return;

    try {
      await axios.delete(
        `http://localhost:5000/api/questions/${id}`
      );

      alert(
        "🗑 Question Deleted"
      );

      fetchQuestions();
    } catch (error) {
      console.error(error);
    }
  };

  const startEdit = (
    questionObj
  ) => {
    setEditingId(
      questionObj._id
    );

    setEditQuestion(
      questionObj.question
    );
  };

  const updateQuestion =
    async () => {
      try {
        await axios.put(
          `http://localhost:5000/api/questions/${editingId}`,
          {
            question:
              editQuestion,
          }
        );

        alert(
          "✅ Question Updated"
        );

        setEditingId(null);
        setEditQuestion("");

        fetchQuestions();
      } catch (error) {
        console.error(error);
      }
    };

  return (
    <div className="admin-page">

      <div className="admin-header">

        <button
          className="home-btn"
          onClick={() =>
            navigate("/")
          }
        >
          🏠 Home
        </button>

        <button
          className="results-btn"
          onClick={() =>
            navigate("/results")
          }
        >
          📊 View Results
        </button>

        <button
          className="logout-btn"
          onClick={logout}
        >
          🚪 Logout
        </button>

      </div>

      <div className="admin-container">

        <h1 className="admin-title">
          Admin Dashboard
        </h1>

        <div className="admin-form">

          <h2>
            Add New Question
          </h2>

          <input
            type="text"
            placeholder="Question"
            value={question}
            onChange={(e) =>
              setQuestion(
                e.target.value
              )
            }
          />

          <input
            type="text"
            placeholder="Option 1"
            value={option1}
            onChange={(e) =>
              setOption1(
                e.target.value
              )
            }
          />

          <input
            type="text"
            placeholder="Option 2"
            value={option2}
            onChange={(e) =>
              setOption2(
                e.target.value
              )
            }
          />

          <input
            type="text"
            placeholder="Option 3"
            value={option3}
            onChange={(e) =>
              setOption3(
                e.target.value
              )
            }
          />

          <input
            type="text"
            placeholder="Option 4"
            value={option4}
            onChange={(e) =>
              setOption4(
                e.target.value
              )
            }
          />

          <input
            type="text"
            placeholder="Correct Answer"
            value={answer}
            onChange={(e) =>
              setAnswer(
                e.target.value
              )
            }
          />

          <button
            className="save-btn"
            onClick={
              saveQuestion
            }
          >
            Save Question
          </button>

        </div>

        <h2
          style={{
            color: "white",
            marginTop: "30px",
            marginBottom:
              "20px",
          }}
        >
          All Questions
        </h2>

        {questions.length ===
        0 ? (
          <p
            style={{
              color:
                "white",
            }}
          >
            No Questions Found
          </p>
        ) : (
          questions.map((q) => (
            <div
              key={q._id}
              className="question-card"
            >

              {editingId ===
              q._id ? (
                <>
                  <input
                    value={
                      editQuestion
                    }
                    onChange={(
                      e
                    ) =>
                      setEditQuestion(
                        e.target
                          .value
                      )
                    }
                  />

                  <br />
                  <br />

                  <button
                    className="save-btn"
                    onClick={
                      updateQuestion
                    }
                  >
                    Update
                  </button>
                </>
              ) : (
                <>
                  <h3>
                    {
                      q.question
                    }
                  </h3>

                  <ul>
                    {q.options.map(
                      (
                        option,
                        index
                      ) => (
                        <li
                          key={
                            index
                          }
                        >
                          {
                            option
                          }
                        </li>
                      )
                    )}
                  </ul>

                  <p>
                    <strong>
                      Answer:
                    </strong>{" "}
                    {q.answer}
                  </p>

                  <button
                    className="save-btn"
                    onClick={() =>
                      startEdit(
                        q
                      )
                    }
                  >
                    Edit
                  </button>

                  <button
                    className="delete-btn"
                    onClick={() =>
                      deleteQuestion(
                        q._id
                      )
                    }
                  >
                    Delete
                  </button>
                </>
              )}

            </div>
          ))
        )}

      </div>

    </div>
  );
}

export default Admin;