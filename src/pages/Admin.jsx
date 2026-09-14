import { useEffect, useRef, useState } from "react";
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
  FiUsers,
  FiSearch,
  FiRefreshCw,
  FiAlertTriangle,
  FiDownload,
  FiUpload,
  FiFileText,
  FiChevronLeft,
  FiChevronRight,
  FiCheckCircle,
  FiClipboard,
} from "react-icons/fi";
import {
  getAdminAuth,
  handleAdminError,
  clearAdminSession,
} from "../utils/adminAuth";
import { messageForError } from "../utils/apiError";
import useSlowFlag from "../utils/useSlowFlag";
import "../styles/Admin.css";

import API from "../config/api";

const DASH = "—";

const orDash = (value) =>
  value === null || value === undefined || value === ""
    ? DASH
    : value;

const downloadBlob = (data, filename) => {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
};

function Admin() {
  const navigate = useNavigate();

  /* =====================
     ADD FORM
  ===================== */

  const [question, setQuestion] = useState("");
  const [option1, setOption1] = useState("");
  const [option2, setOption2] = useState("");
  const [option3, setOption3] = useState("");
  const [option4, setOption4] = useState("");
  const [answer, setAnswer] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [category, setCategory] = useState("programming");
  const [topic, setTopic] = useState("");

  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const [addNotice, setAddNotice] = useState("");
  const [duplicate, setDuplicate] = useState(null);

  /* =====================
     BANK BROWSER
  ===================== */

  const [bankState, setBankState] = useState("loading");
  const [bank, setBank] = useState(null);
  const [bankError, setBankError] = useState("");
  const slowBankLoad = useSlowFlag(bankState === "loading");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [exportBusy, setExportBusy] = useState(false);
  const [rowError, setRowError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  /* =====================
     IMPORT
  ===================== */

  const fileInputRef = useRef(null);

  const [csvText, setCsvText] = useState("");
  const [importState, setImportState] = useState("idle");
  const [importError, setImportError] = useState("");
  const [preview, setPreview] = useState(null);
  const [importSummary, setImportSummary] = useState(null);

  const filtersActive =
    search !== "" ||
    difficultyFilter !== "all" ||
    topicFilter !== "all" ||
    categoryFilter !== "all";

  const hasFilters = filtersActive;

  /* =====================
     DATA LOADING
  ===================== */

  const loadBank = async () => {
    setBankState("loading");
    setBankError("");

    try {
      const res = await axios.get(`${API}/api/admin/questions`, {
        ...getAdminAuth(),
        params: {
          search,
          difficulty: difficultyFilter,
          topic: topicFilter,
          category: categoryFilter,
          page,
          pageSize,
        },
      });

      setBank(res.data);
      setBankState("ready");
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      console.error(error);

      setBankError(
        messageForError(error, "The question bank could not be loaded.")
      );

      setBankState("error");
    }
  };

  useEffect(() => {
    loadBank();
    // Reloads whenever a filter or page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, difficultyFilter, topicFilter, categoryFilter, page, pageSize]);

  // Debounce the text search so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();

      setSearch((previous) => (previous === next ? previous : next));
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const logout = () => {
    clearAdminSession();

    navigate("/admin-login");
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setDifficultyFilter("all");
    setTopicFilter("all");
    setCategoryFilter("all");
    setPage(1);
  };

  /* =====================
     ADD / DUPLICATE
  ===================== */

  const resetForm = () => {
    setQuestion("");
    setOption1("");
    setOption2("");
    setOption3("");
    setOption4("");
    setAnswer("");
    setTopic("");
    setDuplicate(null);
  };

  const postQuestion = async (confirmDuplicate) => {
    return axios.post(
      `${API}/api/questions`,
      {
        question,
        options: [option1, option2, option3, option4],
        answer,
        difficulty,
        category,
        topic: topic.toLowerCase().trim(),
        confirmDuplicate,
      },
      getAdminAuth()
    );
  };

  const saveQuestion = async () => {
    if (
      !question ||
      !option1 ||
      !option2 ||
      !option3 ||
      !option4 ||
      !answer ||
      !topic
    ) {
      setAddError("Please fill in all fields before saving.");
      return;
    }

    setAddBusy(true);
    setAddError("");
    setAddNotice("");
    setDuplicate(null);

    try {
      await postQuestion(false);

      resetForm();

      setAddNotice("Question saved.");

      loadBank();
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      const data = error.response?.data;

      if (error.response?.status === 409 && data?.code === "DUPLICATE_QUESTION") {
        setDuplicate(data.existing || {});
        setAddError(
          "An equivalent question already exists. Review it below and confirm if you still want to add this one."
        );
        return;
      }

      setAddError(messageForError(error, "Could not save the question."));
    } finally {
      setAddBusy(false);
    }
  };

  const saveDuplicateAnyway = async () => {
    setAddBusy(true);
    setAddError("");

    try {
      await postQuestion(true);

      resetForm();

      setAddNotice("Question saved (duplicate confirmed).");

      loadBank();
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      setAddError(
        messageForError(error, "Could not save the question.")
      );
    } finally {
      setAddBusy(false);
    }
  };

  /* =====================
     EDIT / DELETE
  ===================== */

  const startEdit = (questionObj) => {
    setEditingId(questionObj._id);
    setEditQuestion(questionObj.question);
    setRowError("");
  };

  const updateQuestion = async () => {
    if (!editQuestion.trim()) {
      setRowError("The question text cannot be empty.");
      return;
    }

    setEditBusy(true);
    setRowError("");

    try {
      await axios.put(
        `${API}/api/questions/${editingId}`,
        { question: editQuestion },
        getAdminAuth()
      );

      setEditingId(null);
      setEditQuestion("");

      loadBank();
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      setRowError(
        messageForError(error, "Could not update the question.")
      );
    } finally {
      setEditBusy(false);
    }
  };

  const deleteQuestion = async (id) => {
    if (!window.confirm("Delete this question? This cannot be undone.")) {
      return;
    }

    setRowError("");

    try {
      await axios.delete(`${API}/api/questions/${id}`, getAdminAuth());

      loadBank();
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      setRowError(
        messageForError(error, "Could not delete the question.")
      );
    }
  };

  /* =====================
     EXPORT / TEMPLATE
  ===================== */

  const exportQuestions = async () => {
    setExportBusy(true);
    setRowError("");

    try {
      const res = await axios.get(
        `${API}/api/admin/questions/export`,
        {
          ...getAdminAuth(),
          params: {
            search,
            difficulty: difficultyFilter,
            topic: topicFilter,
            category: categoryFilter,
          },
          responseType: "blob",
        }
      );

      downloadBlob(res.data, "brainrace-questions.csv");
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      setRowError("Could not export the filtered questions. Please try again.");
    } finally {
      setExportBusy(false);
    }
  };

  const downloadTemplate = async () => {
    setImportError("");

    try {
      const res = await axios.get(`${API}/api/admin/questions/template`, {
        ...getAdminAuth(),
        responseType: "blob",
      });

      downloadBlob(res.data, "brainrace-questions-template.csv");
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      setImportError("Could not download the template. Please try again.");
    }
  };

  const onFilePicked = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      setCsvText(String(reader.result || ""));
      setPreview(null);
      setImportSummary(null);
      setImportState("idle");
      setImportError("");
    };

    reader.onerror = () => {
      setImportError("Could not read that file.");
    };

    reader.readAsText(file);
    event.target.value = "";
  };

  /* =====================
     IMPORT FLOW
  ===================== */

  const runImport = async (confirm) => {
    if (!csvText.trim()) {
      setImportError("Paste CSV rows or choose a file first.");
      setImportState("idle");
      return;
    }

    setImportError("");
    setImportSummary(null);

    if (confirm) {
      setImportState("importing");
    } else {
      setImportState("previewing");
    }

    try {
      const res = await axios.post(
        `${API}/api/admin/questions/import`,
        { csv: csvText, confirm },
        getAdminAuth()
      );

      if (confirm) {
        setImportSummary(res.data);
        setPreview(null);
        setCsvText("");
        setImportState("done");
        loadBank();
      } else {
        setPreview(res.data);
        setImportState("preview");
      }
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      setImportError(
        messageForError(
          error,
          "Could not process the CSV. Check the format and try again."
        )
      );

      setImportState(confirm ? "preview" : "idle");
    }
  };

  const confirmImport = () => {
    if (!preview) return;

    const ok = window.confirm(
      `Add ${preview.counts.valid} question(s)?\n\n` +
        `${preview.counts.duplicates} duplicate row(s) and ` +
        `${preview.counts.invalid} invalid row(s) will be skipped.`
    );

    if (ok) runImport(true);
  };

  const items = bank?.items || [];
  const facets = bank?.facets || { topics: [], categories: [], difficulties: [] };
  const total = bank?.total ?? 0;
  const totalPages = bank?.totalPages ?? 1;
  const currentPage = bank?.page ?? 1;

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
              onClick={() => navigate("/admin-users")}
            >
              <FiUsers />
              Manage users
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => navigate("/admin-audit")}
            >
              <FiClipboard />
              Audit log
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

        {/* ============ ADD QUESTION ============ */}

        <div className="card">
          <h3 className="card-title">Add a new question</h3>

          <p className="card-desc">
            Questions added here appear in the global quiz for everyone. If an
            equivalent question already exists you will be asked to confirm.
          </p>

          {addNotice && (
            <div className="admin-notice" role="status">
              <FiCheckCircle aria-hidden="true" />
              <span>{addNotice}</span>
            </div>
          )}

          {addError && (
            <div className="admin-notice admin-notice-error" role="alert">
              <FiAlertTriangle aria-hidden="true" />
              <span>{addError}</span>
            </div>
          )}

          {duplicate && (
            <div className="duplicate-warning" role="alert">
              <p className="duplicate-warning-title">
                Possible duplicate already in the bank
              </p>

              <p className="duplicate-question">
                {duplicate.question || "(question text unavailable)"}
              </p>

              {Array.isArray(duplicate.options) && (
                <div className="question-options">
                  {duplicate.options.map((option, index) => (
                    <span className="question-option" key={index}>
                      {option}
                    </span>
                  ))}
                </div>
              )}

              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={saveDuplicateAnyway}
                  disabled={addBusy}
                >
                  {addBusy ? "Saving…" : "Add it anyway"}
                </button>

                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setDuplicate(null);
                    setAddError("");
                  }}
                  disabled={addBusy}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid-2">
            <div className="field">
              <label htmlFor="new-question">Question</label>

              <input
                id="new-question"
                className="input"
                type="text"
                placeholder="e.g. Which language runs in a browser?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="new-answer">Correct answer</label>

              <input
                id="new-answer"
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
              <label htmlFor="new-option-1">Option 1</label>

              <input
                id="new-option-1"
                className="input"
                type="text"
                value={option1}
                onChange={(e) => setOption1(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="new-option-2">Option 2</label>

              <input
                id="new-option-2"
                className="input"
                type="text"
                value={option2}
                onChange={(e) => setOption2(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="new-option-3">Option 3</label>

              <input
                id="new-option-3"
                className="input"
                type="text"
                value={option3}
                onChange={(e) => setOption3(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="new-option-4">Option 4</label>

              <input
                id="new-option-4"
                className="input"
                type="text"
                value={option4}
                onChange={(e) => setOption4(e.target.value)}
              />
            </div>
          </div>

          <div className="options-grid" style={{ marginBottom: 0 }}>
            <div className="field">
              <label htmlFor="new-difficulty">Difficulty</label>

              <select
                id="new-difficulty"
                className="input"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="new-category">Category</label>

              <select
                id="new-category"
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="programming">Programming</option>
                <option value="science">Science</option>
                <option value="mathematics">Mathematics</option>
                <option value="history">History</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="new-topic">Topic</label>

            <input
              id="new-topic"
              className="input"
              type="text"
              placeholder="e.g. python, java, javascript"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={saveQuestion}
            disabled={addBusy}
          >
            <FiPlus />
            {addBusy ? "Saving…" : "Save question"}
          </button>
        </div>

        {/* ============ CSV IMPORT ============ */}

        <div className="card">
          <h3 className="card-title">Bulk import from CSV</h3>

          <p className="card-desc">
            Download the template, fill in one question per row, then preview
            before anything is written. Valid, duplicate and invalid rows are
            listed separately.
          </p>

          <div className="row" style={{ marginBottom: 16 }}>
            <button className="btn btn-secondary" onClick={downloadTemplate}>
              <FiFileText />
              Download template
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <FiUpload />
              Choose CSV file
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFilePicked}
              className="visually-hidden-input"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>

          <div className="field">
            <label htmlFor="csv-paste">CSV content</label>

            <textarea
              id="csv-paste"
              className="input"
              rows={6}
              placeholder={"question,option1,option2,option3,option4,answer,difficulty,category,topic\nWhich language runs in a browser?,Python,JavaScript,Java,C++,JavaScript,easy,programming,javascript"}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setPreview(null);
                setImportSummary(null);
                setImportState("idle");
              }}
            />
          </div>

          {importError && (
            <div className="admin-notice admin-notice-error" role="alert">
              <FiAlertTriangle aria-hidden="true" />
              <span>{importError}</span>
            </div>
          )}

          {importSummary && (
            <div className="admin-notice" role="status">
              <FiCheckCircle aria-hidden="true" />
              <span>
                Import finished: {importSummary.added} added,{" "}
                {importSummary.skipped} duplicate(s) skipped,{" "}
                {importSummary.rejected} row(s) rejected,{" "}
                {importSummary.failed} failed. The question bank below has been
                refreshed.
              </span>
            </div>
          )}

          <div className="row">
            <button
              className="btn btn-secondary"
              onClick={() => runImport(false)}
              disabled={
                importState === "previewing" || importState === "importing"
              }
            >
              <FiSearch />
              {importState === "previewing" ? "Checking…" : "Preview import"}
            </button>

            {importState === "preview" && preview && (
              <button
                className="btn btn-primary"
                onClick={confirmImport}
                disabled={preview.counts.valid === 0}
              >
                <FiPlus />
                Import {preview.counts.valid} valid row
                {preview.counts.valid === 1 ? "" : "s"}
              </button>
            )}
          </div>

          {importState === "preview" && preview && (
            <div style={{ marginTop: 18 }}>
              <p className="muted" role="status">
                Dry run only — nothing has been written. {preview.counts.total}{" "}
                data row{preview.counts.total === 1 ? "" : "s"} read
                {preview.hasHeader ? " (header detected)" : " (no header row)"}.
                {" "}
                {preview.counts.valid} valid · {preview.counts.duplicates}{" "}
                duplicate · {preview.counts.invalid} invalid.
              </p>

              <PreviewTable
                title="Will be added"
                tone="success"
                rows={preview.valid.map((row) => ({
                  line: row.line,
                  question: row.question,
                  detail: `${row.difficulty} · ${row.topic}`,
                }))}
              />

              <PreviewTable
                title="Skipped — already in the bank or duplicated in the file"
                tone="warning"
                rows={preview.duplicates.map((row) => ({
                  line: row.line,
                  question: row.question,
                  detail: row.reason,
                }))}
              />

              <PreviewTable
                title="Rejected — fix these rows and import again"
                tone="danger"
                rows={preview.invalid.map((row) => ({
                  line: row.line,
                  question: row.question || "(blank)",
                  detail: row.reason,
                }))}
              />
            </div>
          )}
        </div>

        {/* ============ QUESTION BANK ============ */}

        <div className="card">
          <div className="row between" style={{ marginBottom: 4 }}>
            <h3 className="card-title">Question bank</h3>

            <div className="row">
              <button
                className="btn btn-secondary btn-sm"
                onClick={exportQuestions}
                disabled={exportBusy}
              >
                <FiDownload />
                {exportBusy ? "Exporting…" : "Export CSV"}
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={loadBank}
                disabled={bankState === "loading"}
              >
                <FiRefreshCw />
                Refresh
              </button>
            </div>
          </div>

          <p className="card-desc">
            {bankState === "ready"
              ? `${total} question${total === 1 ? "" : "s"} match the current filters.`
              : "Browse, search and filter the bank without downloading it all at once."}
          </p>

          <div className="admin-filters">
            <div className="field">
              <label htmlFor="bank-search">Search</label>

              <div className="input-with-icon">
                <FiSearch aria-hidden="true" />

                <input
                  id="bank-search"
                  className="input"
                  type="search"
                  placeholder="Question, topic or option text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="bank-difficulty">Difficulty</label>

              <select
                id="bank-difficulty"
                className="input"
                value={difficultyFilter}
                onChange={(e) => {
                  setDifficultyFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All difficulties</option>

                {(facets.difficulties || []).map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="bank-topic">Topic</label>

              <select
                id="bank-topic"
                className="input"
                value={topicFilter}
                onChange={(e) => {
                  setTopicFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All topics</option>

                {(facets.topics || []).map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="bank-category">Category</label>

              <select
                id="bank-category"
                className="input"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All categories</option>

                {(facets.categories || []).map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {rowError && (
            <div className="admin-notice admin-notice-error" role="alert">
              <FiAlertTriangle aria-hidden="true" />
              <span>{rowError}</span>
            </div>
          )}

          {/* ---- loading ---- */}

          {bankState === "loading" && (
            <div className="loading-screen" style={{ minHeight: "20vh" }}>
              Loading questions…

              {slowBankLoad && (
                <span className="muted" role="status">
                  This is taking longer than expected. Large banks take a moment
                  to count and page.
                </span>
              )}
            </div>
          )}

          {/* ---- error ---- */}

          {bankState === "error" && (
            <div className="empty-state" role="alert">
              <span
                className="empty-icon"
                style={{
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                }}
              >
                <FiAlertTriangle />
              </span>

              <h4 className="card-title">Could not load the question bank</h4>

              <p style={{ marginBottom: 14 }}>{bankError}</p>

              <button className="btn btn-primary" onClick={loadBank}>
                <FiRefreshCw />
                Try again
              </button>
            </div>
          )}

          {/* ---- ready ---- */}

          {bankState === "ready" && total === 0 && !hasFilters && (
            <div className="empty-state">
              <span className="empty-icon">
                <FiFileText />
              </span>

              <h4 className="card-title">No questions yet</h4>

              <p>
                The bank is empty. Add the first question with the form above,
                or bulk-import a CSV.
              </p>
            </div>
          )}

          {bankState === "ready" && total === 0 && hasFilters && (
            <div className="empty-state">
              <span className="empty-icon">
                <FiSearch />
              </span>

              <h4 className="card-title">No question matches this filter</h4>

              <p style={{ marginBottom: 14 }}>
                {search
                  ? `Nothing matched “${search}”`
                  : "Nothing matched the selected filters"}
                {difficultyFilter !== "all"
                  ? ` at ${difficultyFilter} difficulty`
                  : ""}
                . Try a broader search or clear the filters.
              </p>

              <button className="btn btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          )}

          {bankState === "ready" && total > 0 && (
            <>
              <div className="table-wrap" style={{ boxShadow: "none" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Difficulty</th>
                      <th>Topic</th>
                      <th>Category</th>
                      <th>Answer</th>
                      <th className="num">Options</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map((questionObj) => (
                      <tr key={questionObj._id}>
                        {editingId === questionObj._id ? (
                          <td colSpan={7}>
                            <div className="question-edit">
                              <input
                                className="input"
                                value={editQuestion}
                                onChange={(e) =>
                                  setEditQuestion(e.target.value)
                                }
                                aria-label="Question text"
                              />

                              <div className="row" style={{ marginTop: 10 }}>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={updateQuestion}
                                  disabled={editBusy}
                                >
                                  {editBusy ? "Saving…" : "Save changes"}
                                </button>

                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => {
                                    setEditingId(null);
                                    setEditQuestion("");
                                  }}
                                  disabled={editBusy}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td
                              className="dash-cell-truncate"
                              style={{ maxWidth: 340 }}
                              title={questionObj.question || ""}
                            >
                              {orDash(questionObj.question)}
                            </td>

                            <td>
                              <span
                                className={`badge diff-${questionObj.difficulty || "easy"}`}
                              >
                                {questionObj.difficulty || "easy"}
                              </span>
                            </td>

                            <td style={{ textTransform: "capitalize" }}>
                              {orDash(questionObj.topic)}
                            </td>

                            <td style={{ textTransform: "capitalize" }}>
                              {orDash(questionObj.category)}
                            </td>

                            <td
                              className="dash-cell-truncate"
                              title={questionObj.answer || ""}
                            >
                              {orDash(questionObj.answer)}
                            </td>

                            <td className="num">
                              {Array.isArray(questionObj.options)
                                ? questionObj.options.length
                                : DASH}
                            </td>

                            <td style={{ textAlign: "right" }}>
                              <div
                                className="row"
                                style={{ justifyContent: "flex-end", gap: 8 }}
                              >
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => startEdit(questionObj)}
                                >
                                  <FiEdit2 />
                                  Edit
                                </button>

                                <button
                                  className="btn btn-danger-soft btn-sm"
                                  onClick={() => deleteQuestion(questionObj._id)}
                                >
                                  <FiTrash2 />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <div className="pager-status" role="status">
                  Showing{" "}
                  {(currentPage - 1) * (bank?.pageSize || pageSize) + 1}–
                  {Math.min(
                    currentPage * (bank?.pageSize || pageSize),
                    total
                  )}{" "}
                  of {total}
                </div>

                <div className="row">
                  <label className="pager-label" htmlFor="bank-page-size">
                    Rows
                  </label>

                  <select
                    id="bank-page-size"
                    className="input pager-select"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    <FiChevronLeft />
                    Previous
                  </button>

                  <span className="pager-status">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage >= totalPages}
                  >
                    Next
                    <FiChevronRight />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// Small read-only table used by the import preview.
function PreviewTable({ title, tone, rows }) {
  if (!rows || rows.length === 0) return null;

  const shown = rows.slice(0, 100);

  return (
    <div style={{ marginTop: 14 }}>
      <h4 className="preview-title">
        {title} · {rows.length}
      </h4>

      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th className="num">Row</th>
              <th>Question</th>
              <th>Detail</th>
            </tr>
          </thead>

          <tbody>
            {shown.map((row) => (
              <tr key={`${row.line}-${row.question}`}>
                <td className="num">{row.line}</td>

                <td
                  className="dash-cell-truncate"
                  style={{ maxWidth: 360 }}
                  title={row.question}
                >
                  {row.question}
                </td>

                <td>
                  <span className={`badge badge-${tone}`}>{row.detail}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > shown.length && (
        <p className="muted" style={{ marginTop: 8 }}>
          Showing the first {shown.length} of {rows.length} rows.
        </p>
      )}
    </div>
  );
}

export default Admin;
