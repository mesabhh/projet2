import React, { useState } from "react";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider, githubProvider, facebookProvider } from "./firebase";
import { useNavigate } from "react-router-dom";

export default function Connexion() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  // 📧 Connexion avec email/mot de passe
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setMessage("Connexion réussie");
      navigate("/");
    } catch (error) {
      setMessage("Erreur : " + error.message);
    }
  };

  // 🔐 Fonction générique pour login social
  const handleSocialLogin = async (providerName) => {
    try {
      let provider;
      if (providerName === "google") provider = googleProvider;
      if (providerName === "github") provider = githubProvider;
      if (providerName === "facebook") provider = facebookProvider;

      await signInWithPopup(auth, provider);
      setMessage(`Connecté avec ${providerName}`);
      navigate("/profile");
    } catch (error) {
      setMessage("Erreur : " + error.message);
    }
  };

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: "420px" }}>
        <h1 className="title has-text-centered">Connexion</h1>

        <div className="box">
          <form onSubmit={handleLogin}>
            <div className="field">
              <label className="label">Adresse email</label>
              <div className="control has-icons-left">
                <input
                  className="input"
                  type="email"
                  placeholder="ex: nom@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <span className="icon is-small is-left">
                  <i className="fas fa-envelope"></i>
                </span>
              </div>
            </div>

            <div className="field">
              <label className="label">Mot de passe</label>
              <div className="control has-icons-left">
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <span className="icon is-small is-left">
                  <i className="fas fa-lock"></i>
                </span>
              </div>
            </div>

            <div className="field">
              <button className="button is-link is-fullwidth" type="submit">
                Se connecter
              </button>
            </div>
          </form>

          <div className="has-text-centered" style={{ margin: "1rem 0" }}>
            — ou —
          </div>

          {/* 🔸 Google */}
          <div className="field">
            <button
              className="button is-dark is-fullwidth"
              type="button"
              onClick={() => handleSocialLogin("google")}
            >
              <span>Se connecter avec Google</span>
            </button>
          </div>

          {/* 🔸 GitHub */}
          <div className="field">
            <button
              className="button is-black is-fullwidth"
              type="button"
              onClick={() => handleSocialLogin("github")}
            >
              <span>Se connecter avec GitHub</span>
            </button>
          </div>

          {/* 🔸 Facebook */}
          <div className="field">
            <button
              className="button is-info is-fullwidth"
              type="button"
              onClick={() => handleSocialLogin("facebook")}
            >
              <span>Se connecter avec Facebook</span>
            </button>
          </div>

          {message && (
            <div
              className={`notification ${
                message.includes("Erreur") ? "is-danger" : "is-success"
              }`}
            >
              {message}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
