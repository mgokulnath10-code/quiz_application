import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import { useState, useEffect } from "react";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Quiz from "./pages/Quiz";
import Admin from "./pages/Admin";
import Results from "./pages/Results";
import Leaderboard from "./pages/Leaderboard";
import AdminStats from "./pages/AdminStats";
import Certificate from "./pages/Certificate";
import Profile from "./pages/Profile";
import AdminLogin from "./pages/AdminLogin";
import Rooms from "./pages/Rooms";
import RoomAdmin from "./pages/RoomAdmin";
import RoomQuiz from "./pages/RoomQuiz";
import AdminRooms from "./pages/AdminRooms";

import ProtectedRoute from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";

import ForgotPassword from "./pages/ForgotPassword";
import QuizSetup from "./pages/QuizSetup";
import OAuthCallback from "./pages/OAuthCallback";

function App() {

  return (
    <BrowserRouter>
      <div>

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
  path="/results"
  element={<Results />}
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
              <ProtectedRoute>
                <Results />
              </ProtectedRoute>
            }
          />

          <Route
            path="/leaderboard"
            element={
              <ProtectedRoute>
                <Leaderboard />
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

        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;