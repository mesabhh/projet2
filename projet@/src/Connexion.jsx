import React, { useMemo, useState } from "react";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import {
  auth,
  googleProvider,
  githubProvider,
  facebookProvider,
} from "./firebase";
import { Link, useNavigate } from "react-router-dom";

const ROLES = {
  admin: {
    title: "Coordonnateur",
    hero: "Espace coordination",
    description:
      "Créez les formulaires, paramétrez les règles IA et validez les plans de cours de votre département.",
    checklist: [
      "Activation/désactivation des formulaires",
      "Filtrage et validation des plans",
      "Téléchargement des PDF",
    ],
  },
  enseignant: {
    title: "Enseignant",
    hero: "Espace enseignant",
    description:
      "Répondez au formulaire actif, déclenchez l’analyse IA et suivez vos soumissions en un coup d’œil.",
    checklist: [
      "Analyse IA par question",
      "Historique et statuts",
      "Génération automatique du PDF",
    ],
  },
};

const providerMap = {
  google: googleProvider,
  github: githubProvider,
  facebook: facebookProvider,
};

export default function Connexion() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRole, setSelectedRole] = useState("enseignant");
  const navigate = useNavigate();

  const roleInfo = useMemo(() => ROLES[selectedRole], [selectedRole]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (error) {
      setMessage("Erreur : " + error.message);
    }
  };

  const handleSocialLogin = async (providerName) => {
    const provider = providerMap[providerName];
    if (!provider) return;
    setMessage("");
    try {
      await signInWithPopup(auth, provider);
      navigate("/");
    } catch (error) {
      setMessage("Erreur : " + error.message);
    }
  };

  return (
    <section className="auth-layout">
      <div className="auth-hero">
        <p className="panel-label">Choisir mon espace</p>
        <h1>{roleInfo.hero}</h1>
        <p className="hint">{roleInfo.description}</p>

        <div className="role-options">
          {Object.entries(ROLES).map(([key, role]) => (
            <button
              type="button"
              key={key}
              className={`role-option ${
                selectedRole === key ? "role-option-active" : ""
              }`}
              onClick={() => setSelectedRole(key)}
            >
              <div>
                <p className="panel-label">{role.title}</p>
                <h3>{role.hero}</h3>
                <ul>
                  {role.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              {selectedRole === key && (
                <span className="status-pill">Sélectionné</span>
              )}
            </button>
          ))}
        </div>

        <div className="test-credentials">
          <p className="label">Comptes de test (à adapter)</p>
          <p>
            Admin : <code>coordonnateur@demo.ca</code>
          </p>
          <p>
            Enseignant : <code>enseignant@demo.ca</code>
          </p>
          <p className="hint">
            Créez vos comptes Firebase puis mettez-les à jour ici pour vos
            évaluateurs.
          </p>
        </div>
      </div>

      <div className="auth-panel">
        <h2>Connexion {roleInfo.title}</h2>
        <p className="hint">
          Utilisez votre courriel institutionnel ou un fournisseur social. Le rôle
          affiché correspond à vos autorisations dans Firestore.
        </p>

        <form onSubmit={handleLogin} className="auth-form">
          <label>
            Adresse email
            <input
              type="email"
              placeholder="ex: nom@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Mot de passe
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button className="primary-button" type="submit">
            Se connecter
          </button>
        </form>

        <div className="divider">
          <span>Ou continuez avec</span>
        </div>

        <div className="social-grid">
          <button
            className="ghost-button"
            type="button"
            onClick={() => handleSocialLogin("google")}
          >
            Google
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => handleSocialLogin("github")}
          >
            GitHub
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => handleSocialLogin("facebook")}
          >
            Facebook
          </button>
        </div>

        {message && (
          <div
            className={`banner ${message.includes("Erreur") ? "danger" : "success"}`}
            style={{ marginTop: "1rem" }}
          >
            {message}
          </div>
        )}

        <p className="hint" style={{ marginTop: "1rem" }}>
          Nouvel utilisateur ?{" "}
          <Link to="/inscription" style={{ color: "#8dd7ff" }}>
            Créer un compte
          </Link>
        </p>
      </div>
    </section>
  );
}
