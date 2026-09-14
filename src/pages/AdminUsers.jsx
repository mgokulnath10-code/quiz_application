import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft,
  FiUsers,
  FiAlertTriangle,
  FiRefreshCw,
  FiSearch,
  FiSlash,
  FiCheckCircle,
  FiShield,
} from "react-icons/fi";
import {
  getAdminAuth,
  handleAdminError,
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

const formatDateTime = (value) => {
  if (!value) return DASH;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return DASH;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const PROVIDER_LABEL = {
  local: "Email",
  google: "Google",
  microsoft: "Microsoft",
  github: "GitHub",
};

function AdminUsers() {
  const navigate = useNavigate();

  const [state, setState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [payload, setPayload] = useState(null);
  const slowLoad = useSlowFlag(state === "loading");

  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setState("loading");
    setErrorMessage("");

    try {
      const res = await axios.get(`${API}/api/admin/users`, getAdminAuth());

      setPayload(res.data);
      setState("ready");
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      console.error(error);

      setErrorMessage(
        messageForError(error, "The user list could not be loaded.")
      );

      setState("error");
    }
  };

  useEffect(() => {
    load();
    // Loaded once on mount; the Refresh button re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const users = useMemo(
    () => payload?.users || [],
    [payload]
  );

  const providers = useMemo(
    () => [...new Set(users.map((user) => user.provider || "local"))],
    [users]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return users.filter((user) => {
      if (
        needle &&
        !String(user.name || "").toLowerCase().includes(needle) &&
        !String(user.email || "").toLowerCase().includes(needle)
      ) {
        return false;
      }

      if (
        providerFilter !== "all" &&
        (user.provider || "local") !== providerFilter
      ) {
        return false;
      }

      if (statusFilter === "active" && user.disabled) return false;
      if (statusFilter === "disabled" && !user.disabled) return false;

      return true;
    });
  }, [users, query, providerFilter, statusFilter]);

  const toggleDisabled = async (user) => {
    const next = !user.disabled;

    setBusyId(user._id);
    setRowError("");
    setNotice("");

    try {
      await axios.patch(
        `${API}/api/admin/users/${user._id}/disabled`,
        { disabled: next },
        getAdminAuth()
      );

      setPayload((previous) => ({
        ...previous,
        users: previous.users.map((row) =>
          row._id === user._id ? { ...row, disabled: next } : row
        ),
      }));

      setNotice(
        next
          ? `${user.name || user.email} is disabled. Their existing ` +
              "sign-in tokens stop working on the next request."
          : `${user.name || user.email} can sign in again.`
      );
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      console.error(error);

      setRowError(
        error.response?.data?.message ||
          `Could not change the status of ${user.email}.`
      );
    } finally {
      setBusyId(null);
    }
  };

  const disabledCount = users.filter((user) => user.disabled).length;

  /* =====================
     STATES
  ===================== */

  if (state === "loading") {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="page-topbar">
            <div>
              <h1 className="page-title">Manage users</h1>

              <p className="page-subtitle">
                Accounts, activity and access.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="loading-screen" style={{ minHeight: "24vh" }}>
              Loading users…
            </div>

            {slowLoad && (
              <p className="muted" role="status" style={{ textAlign: "center" }}>
                This is taking longer than expected. The server may be
                waking up.
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
          <div className="page-topbar">
            <div>
              <h1 className="page-title">Manage users</h1>

              <p className="page-subtitle">
                Accounts, activity and access.
              </p>
            </div>
          </div>

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

            <h3 className="card-title">Could not load the user list</h3>

            <p style={{ maxWidth: 520, margin: "0 auto 18px" }}>
              {errorMessage} No account has been changed.
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

  if (users.length === 0) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="page-topbar">
            <div>
              <h1 className="page-title">Manage users</h1>

              <p className="page-subtitle">
                Accounts, activity and access.
              </p>
            </div>

            <button
              className="btn btn-ghost"
              onClick={() => navigate("/admin")}
            >
              <FiArrowLeft />
              Admin dashboard
            </button>
          </div>

          <div className="card empty-state">
            <span className="empty-icon">
              <FiUsers />
            </span>

            <h3 className="card-title">No accounts yet</h3>

            <p>
              Nobody has registered on this server. Accounts appear
              here as soon as someone signs up, or signs in with
              Google, Microsoft or GitHub.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* =====================
     POPULATED
  ===================== */

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Manage users</h1>

            <p className="page-subtitle">
              {users.length} account{users.length === 1 ? "" : "s"}
              {disabledCount > 0
                ? ` · ${disabledCount} disabled`
                : ""}
              . Accounts are never deleted, only disabled.
            </p>
          </div>

          <div className="row">
            <button className="btn btn-secondary" onClick={load}>
              <FiRefreshCw />
              Refresh
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => navigate("/admin")}
            >
              <FiArrowLeft />
              Admin dashboard
            </button>
          </div>
        </div>

        {notice && (
          <div className="admin-notice" role="status">
            <FiShield aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        {rowError && (
          <div className="admin-notice admin-notice-error" role="alert">
            <FiAlertTriangle aria-hidden="true" />
            <span>{rowError}</span>
          </div>
        )}

        <div className="card">
          <h3 className="card-title">Search and filter</h3>

          <p className="card-desc">
            Narrow the list by name, email, sign-in provider or
            access status.
          </p>

          <div className="admin-filters">
            <div className="field">
              <label htmlFor="user-search">Search</label>

              <div className="input-with-icon">
                <FiSearch aria-hidden="true" />

                <input
                  id="user-search"
                  className="input"
                  type="search"
                  placeholder="Name or email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="user-provider">Provider</label>

              <select
                id="user-provider"
                className="input"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
              >
                <option value="all">All providers</option>

                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {PROVIDER_LABEL[provider] || provider}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="user-status">Status</label>

              <select
                id="user-status"
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All accounts</option>
                <option value="active">Enabled only</option>
                <option value="disabled">Disabled only</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">
            {filtered.length} of {users.length} accounts
          </h3>

          <p className="card-desc">
            Attempts and scores come from saved quiz results. Legacy
            attempts that predate per-account result records are
            matched by display name.
          </p>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <FiSearch />
              </span>

              <h4 className="card-title">No account matches</h4>

              <p style={{ marginBottom: 14 }}>
                Nothing matched “{query}” with the selected filters.
                Clear the search to see all {users.length} accounts.
              </p>

              <button
                className="btn btn-secondary"
                onClick={() => {
                  setQuery("");
                  setProviderFilter("all");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="table-wrap" style={{ boxShadow: "none" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Provider</th>
                    <th>Verified</th>
                    <th className="num">Attempts</th>
                    <th className="num">Average</th>
                    <th className="num">Best</th>
                    <th>Last activity</th>
                    <th>Access</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((user) => (
                    <tr key={user._id}>
                      <td>
                        <strong>{orDash(user.name)}</strong>
                      </td>

                      <td
                        className="dash-cell-truncate"
                        title={user.email || ""}
                      >
                        {orDash(user.email)}
                      </td>

                      <td>
                        <span className="badge badge-neutral">
                          {PROVIDER_LABEL[user.provider] ||
                            orDash(user.provider)}
                        </span>
                      </td>

                      <td>
                        {user.verified ? (
                          <span className="badge badge-success">
                            <FiCheckCircle />
                            Yes
                          </span>
                        ) : (
                          <span className="badge badge-warning">
                            Pending
                          </span>
                        )}
                      </td>

                      <td className="num">
                        {user.attempts}
                        {user.legacyAttempts > 0 && (
                          <span
                            className="muted"
                            title={
                              `${user.legacyAttempts} attempt(s) matched by ` +
                              "display name because they predate per-account records"
                            }
                          >
                            {" "}
                            *
                          </span>
                        )}
                      </td>

                      <td className="num">
                        {user.averageScore === null
                          ? DASH
                          : user.averageScore}
                      </td>

                      <td className="num">
                        {user.bestScore === null ? DASH : user.bestScore}
                      </td>

                      <td>{formatDateTime(user.lastActivity)}</td>

                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          {user.disabled ? (
                            <span className="badge badge-danger">
                              <FiSlash />
                              Disabled
                            </span>
                          ) : (
                            <span className="badge badge-success">
                              <FiCheckCircle />
                              Enabled
                            </span>
                          )}

                          <button
                            className={
                              user.disabled
                                ? "btn btn-secondary btn-sm"
                                : "btn btn-danger-soft btn-sm"
                            }
                            disabled={busyId === user._id}
                            aria-busy={busyId === user._id}
                            onClick={() => toggleDisabled(user)}
                          >
                            {busyId === user._id
                              ? "Saving…"
                              : user.disabled
                                ? "Enable"
                                : "Disable"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default AdminUsers;
