import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./Navbar.jsx";
import PrivateRoute from "./PrivateRoute.jsx";
import GestionFormAdmin from "./GestionFormAdmin.jsx";
import App from "./App.jsx";
import Profile from "./Profile.jsx";
import Connexion from "./Connexion.jsx";
import Inscription from "./inscription.jsx";
import AiSettings from "./components/AiSettings.jsx";

export function Routeur() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        {/* Routes privees */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <App />
            </PrivateRoute>
          }
        />

        <Route
          path="/gestion-formulaires"
          element={
            <PrivateRoute>
              <GestionFormAdmin />
            </PrivateRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          }
        />
        <Route
          path="/ia"
          element={
            <PrivateRoute>
              <AiSettings />
            </PrivateRoute>
          }
        />

        {/* Routes publiques */}
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/inscription" element={<Inscription />} />
      </Routes>
    </BrowserRouter>
  );
}
