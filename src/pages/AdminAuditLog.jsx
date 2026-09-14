import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft,
  FiRefreshCw,
  FiSearch,
  FiAlertTriangle,
  FiClipboard,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import {
  getAdminAuth,
  handleAdminError,
} from "../utils/adminAuth";
import useSlowFlag from "../utils/useSlowFlag";
import "../styles/Admin.css";

import API from "../config/api";

const DASH = "—";

const orDash = (value) =>
  value === null || value === undefined || value === ""
    ? DASH
    : value;

const ACTION_LABEL = {
  "admin.login": "Admin sign-in",
  "question.create": "Question created",
  "question.update": "Question updated",
  "question.delete": "Question deleted",
  "questions.import": "CSV import",
  "user.enable": "Account enabled",
  "user.disable": "Account disabled",
  "room.force_end": "Room force-ended",
  "room.delete": "Room deleted",
};

const labelFor = (action) => ACTION_LABEL[action] || action || DASH;

const formatDateTime = (value) => {
  if (!value) return DASH;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return DASH;

  return date.toLocaleString();
};

function AdminAuditLog() {
  const navigate = useNavigate();

  const [state, setState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [payload, setPayload] = useState(null);
  const slowLoad = useSlowFlag(state === "loading");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const hasFilters =
    search !== "" ||
    actionFilter !== "all" ||
    from !== "" ||
    to !== "";

  const load = async () => {
    setState("loading");
    setErrorMessage("");

    try {
      const res = await axios.get(`${API}/api/admin/audit-log`, {
        ...getAdminAuth(),
        params: {
          search,
          action: actionFilter,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize,
        },
      });

      setPayload(res.data);
      setState("ready");
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      console.error(error);

      setErrorMessage(
        error.response?.data?.message ||
          "The audit log could not be loaded."
      );

      setState("error");
    }
  };

  useEffect(() => {
    load();
    // Reloads whenever a filter or page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, actionFilter, from, to, page, pageSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();

      setSearch((previous) => (previous === next ? previous : next));
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setActionFilter("all");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const items = payload?.items || [];
  const total = payload?.total ?? 0;
  const totalPages = payload?.totalPages ?? 1;
  const currentPage = payload?.page ?? 1;
  const actions = payload?.facets?.actions || [];

  const header = (
    <div className="page-topbar">
      <div>
        <h1 className="page-title">Audit log</h1>

        <p className="page-subtitle">
          Every recorded admin action, newest first. Credentials and request
          bodies are never stored.
        </p>
      </div>

      <div className="row">
        <button
          className="btn btn-secondary"
          onClick={load}
          disabled={state === "loading"}
        >
          <FiRefreshCw />
          Refresh
        </button>

        <button className="btn btn-ghost" onClick={() => navigate("/admin")}>
          <FiArrowLeft />
          Admin dashboard
        </button>
      </div>
    </div>
  );

  if (state === "loading") {
    return (
      <div className="page">
        <div className="page-inner">
          {header}

          <div className="card">
            <div className="loading-screen" style={{ minHeight: "24vh" }}>
              Loading the audit log…
            </div>

            {slowLoad && (
              <p className="muted" role="status" style={{ textAlign: "center" }}>
                This is taking longer than expected. The server may be waking
                up.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="page">
        <div className="page-inner">
          {header}

          <div className="card empty-state" role="alert">
            <span
              className="empty-icon"
              style={{
                background: "var(--danger-soft)",
                color: "var(--danger)",
              }}
            >
              <FiAlertTriangle />
            </span>

            <h3 className="card-title">Could not load the audit log</h3>

            <p style={{ maxWidth: 520, margin: "0 auto 18px" }}>
              {errorMessage}
            </p>

            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={load}>
                <FiRefreshCw />
                Try again
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => navigate("/admin")}
              >
                <FiArrowLeft />
                Admin dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-inner">
        {header}

        <div className="card">
          <h3 className="card-title">Search and filter</h3>

          <p className="card-desc">
            Narrow by action, free text or date. Times are shown in your local
            timezone.
          </p>

          <div className="admin-filters">
            <div className="field">
              <label htmlFor="audit-search">Search</label>

              <div className="input-with-icon">
                <FiSearch aria-hidden="true" />

                <input
                  id="audit-search"
                  className="input"
                  type="search"
                  placeholder="Summary, action or target id"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="audit-action">Action</label>

              <select
                id="audit-action"
                className="input"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All actions</option>

                {actions.map((action) => (
                  <option key={action} value={action}>
                    {labelFor(action)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="audit-from">From</label>

              <input
                id="audit-from"
                className="input"
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="audit-to">To</label>

              <input
                id="audit-to"
                className="input"
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        {total === 0 && !hasFilters && (
          <div className="card empty-state">
            <span className="empty-icon">
              <FiClipboard />
            </span>

            <h3 className="card-title">No admin actions recorded yet</h3>

            <p>
              Sign-ins, question changes, CSV imports, account changes and room
              removals appear here as soon as they happen.
            </p>
          </div>
        )}

        {total === 0 && hasFilters && (
          <div className="card empty-state">
            <span className="empty-icon">
              <FiSearch />
            </span>

            <h3 className="card-title">No entry matches these filters</h3>

            <p style={{ marginBottom: 14 }}>
              {search ? `Nothing matched “${search}”` : "Nothing matched"}
              {actionFilter !== "all"
                ? ` for action “${labelFor(actionFilter)}”`
                : ""}
              {from || to ? " in the selected date range" : ""}.
            </p>

            <button className="btn btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}

        {total > 0 && (
          <div className="card">
            <h3 className="card-title">
              {total} recorded action{total === 1 ? "" : "s"}
            </h3>

            <p className="card-desc">
              Newest first. A failed audit write never blocks the action it
              describes, so this list is a record, not a gate.
            </p>

            <div className="table-wrap" style={{ boxShadow: "none" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Summary</th>
                    <th>Target</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((entry) => (
                    <tr key={entry._id}>
                      <td className="dash-cell-truncate">
                        {formatDateTime(entry.createdAt)}
                      </td>

                      <td>{orDash(entry.actor)}</td>

                      <td>
                        <span className="badge badge-neutral">
                          {labelFor(entry.action)}
                        </span>
                      </td>

                      <td
                        className="dash-cell-truncate"
                        style={{ maxWidth: 380 }}
                        title={entry.summary || ""}
                      >
                        {orDash(entry.summary)}
                      </td>

                      <td className="dash-cell-truncate">
                        {entry.targetType
                          ? `${entry.targetType} ${entry.targetId || ""}`.trim()
                          : orDash(entry.targetId)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <div className="pager-status" role="status">
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, total)} of {total}
              </div>

              <div className="row">
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                  <FiChevronRight />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminAuditLog;
