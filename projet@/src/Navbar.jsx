import { Link, useNavigate } from "react-router-dom";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "./firebase";

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/connexion"); // ✅ mieux de rediriger vers connexion après déconnexion
  };

  return (
    <nav
      className="navbar"
      role="navigation"
      aria-label="main navigation"
      style={{ backgroundColor: "#6a0dad" }}
    >
      <div className="navbar-brand">
        <Link
          className="navbar-item"
          to="/"
          style={{ color: "white", fontWeight: "bold" }}
        >
          Home
        </Link>

        <a
          role="button"
          className={`navbar-burger ${isActive ? "is-active" : ""}`}
          aria-label="menu"
          aria-expanded="false"
          onClick={() => setIsActive(!isActive)}
        >
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </a>
      </div>

      <div className={`navbar-menu ${isActive ? "is-active" : ""}`}>
        <div className="navbar-end">
          {/* 🔓 Utilisateur non connecté */}
          {!user && (
            <>
              <div className="navbar-item">
                <Link
                  className="button"
                  to="/connexion"
                  style={{ backgroundColor: "black", color: "white", border: "none" }}
                >
                  Connexion
                </Link>
              </div>
              <div className="navbar-item">
                <Link
                  className="button"
                  to="/inscription"
                  style={{ backgroundColor: "black", color: "white", border: "none" }}
                >
                  Inscription
                </Link>
              </div>
            </>
          )}

          {/* 🔐 Utilisateur connecté */}
          {user && (
            <>
              <div className="navbar-item">
                <Link
                  className="button"
                  to="/profile"
                  style={{ backgroundColor: "black", color: "white", border: "none" }}
                >
                  Profil
                </Link>
              </div>

              {/* 💬 Onglet Messages */}
              <div className="navbar-item">
                <Link
                  className="button"
                  to="/chat"
                  style={{ backgroundColor: "black", color: "white", border: "none" }}
                >
                  Messages
                </Link>
              </div>

              <div className="navbar-item">
                <button
                  className="button"
                  onClick={handleLogout}
                  style={{ backgroundColor: "black", color: "white", border: "none" }}
                >
                  Déconnexion
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
