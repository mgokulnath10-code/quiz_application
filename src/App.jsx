import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

// Route-level code splitting: each page is its own chunk, so the
// heavy charting dependency (recharts, imported only by Dashboard
// and AdminStats) is not in the initial bundle every visitor
// downloads on the login page.
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Quiz = lazy(() => import("./pages/Quiz"));
const Admin = lazy(() => import("./pages/Admin"));
const Results = lazy(() => import("./pages/Results"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const AdminStats = lazy(() => import("./pages/AdminStats"));
const Certificate = lazy(() => import("./pages/Certificate"));
const Profile = lazy(() => import("./pages/Profile"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const Rooms = lazy(() => import("./pages/Rooms"));
const RoomAdmin = lazy(() => import("./pages/RoomAdmin"));
const RoomQuiz = lazy(() => import("./pages/RoomQuiz"));
const AdminRooms = lazy(() => import("./pages/AdminRooms"));

import ProtectedRoute from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";

const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const QuizSetup = lazy(() => import("./pages/QuizSetup"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminAuditLog = lazy(() => import("./pages/AdminAuditLog"));

// Shown while a route chunk is fetched. Reuses the existing
// loading presentation from styles/Theme.css.
const RouteFallback = () => (
  <div className="loading-screen">Loading…</div>
);

function App() {

  return (
    <BrowserRouter>
      <div>

        <Suspense fallback={<RouteFallback />}>
          <Routes>

          {/* HOME */}
          <Route
            path="/"
            element={<Home />}
          />

          {/* USER ROUTES */}
          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/oauth/callback"
            element={<OAuthCallback />}
          />

          <Route
            path="/quiz-setup"
            element={
              <ProtectedRoute>
                <QuizSetup />
              </ProtectedRoute>
            }
          />

          <Route
            path="/register"
            element={<Register />}
          />

            <Route
  path="/forgot-password"
  element={<ForgotPassword />}
/>

          <Route
            path="/quiz"
            element={
              <ProtectedRoute>
                <Quiz />
              </ProtectedRoute>
            }
          />

          <Route
            path="/results"
            element={
              <ProtectedRoute allowAdmin>
                <Results />
              </ProtectedRoute>
            }
          />

          <Route
            path="/leaderboard"
            element={
              <ProtectedRoute allowAdmin>
                <Leaderboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/certificate"
            element={
              <ProtectedRoute>
                <Certificate />
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          {/* ROOM ROUTES */}
          <Route
            path="/rooms"
            element={
              <ProtectedRoute>
                <Rooms />
              </ProtectedRoute>
            }
          />

          <Route
            path="/room-admin/:roomId"
            element={
              <ProtectedRoute>
                <RoomAdmin />
              </ProtectedRoute>
            }
          />

          <Route
            path="/room/:roomId"
            element={
              <ProtectedRoute>
                <RoomQuiz />
              </ProtectedRoute>
            }
          />

          {/* ADMIN ROUTES */}
          <Route
            path="/admin-login"
            element={<AdminLogin />}
          />

          <Route
            path="/admin"
            element={
              <AdminProtectedRoute>
                <Admin />
              </AdminProtectedRoute>
            }
          />

          <Route
            path="/admin-stats"
            element={
              <AdminProtectedRoute>
                <AdminStats />
              </AdminProtectedRoute>
            }
          />

          <Route
            path="/admin-rooms"
            element={
              <AdminProtectedRoute>
                <AdminRooms />
              </AdminProtectedRoute>
            }
          />

          <Route
            path="/admin-users"
            element={
              <AdminProtectedRoute>
                <AdminUsers />
              </AdminProtectedRoute>
            }
          />

          <Route
            path="/admin-audit"
            element={
              <AdminProtectedRoute>
                <AdminAuditLog />
              </AdminProtectedRoute>
            }
          />

          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

export default App;