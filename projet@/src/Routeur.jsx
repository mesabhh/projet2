import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./Navbar.jsx";
import PrivateRoute from "./PrivateRoute.jsx";

// Pages
import App from "./App.jsx";
import Profile from "./Profile.jsx";
import Connexion from "./Connexion.jsx";
import Inscription from "./Inscription.jsx";

export function Routeur() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        {/* 🔐 Routes privées */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <App />
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


        {/* 🌐 Routes publiques */}
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/inscription" element={<Inscription />} />
      </Routes>
    </BrowserRouter>
  );
}
