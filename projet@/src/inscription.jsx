import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  sendEmailVerification,
} from "firebase/auth";
import {
  auth,
  firestore,
  googleProvider,
  githubProvider,
  facebookProvider,
} from "./firebase";
import { useNavigate } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";

export default function Inscription() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  // 📌 Sauvegarde utilisateur Firestore
  const saveUserToFirestore = async (user) => {
    if (!user) return;
    const userRef = doc(firestore, "users", user.uid);
    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email,
      },
      { merge: true }
    );
  };

  // 📨 Inscription avec email et envoi du lien de vérification
  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Ajouter le nom d'affichage
      await updateProfile(user, { displayName });

      // Sauvegarder dans Firestore
      await saveUserToFirestore(user);

      // 📩 Envoyer l'email de vérification
      await sendEmailVerification(user);

      setMessage(
        "Compte créé avec succès ! Un email de vérification vous a été envoyé."
      );
      navigate("/connexion");
    } catch (error) {
      setMessage("Erreur : " + error.message);
    }
  };

  // 🌐 Inscription via Google / GitHub / Facebook (pas besoin de vérif email ici)
  const handleSocialRegister = async (providerName) => {
    try {
      let provider;
      if (providerName === "google") provider = googleProvider;
      if (providerName === "github") provider = githubProvider;
      if (providerName === "facebook") provider = facebookProvider;

      const result = await signInWithPopup(auth, provider);
      await saveUserToFirestore(result.user);

      setMessage(`Connecté avec ${providerName}`);
      navigate("/");
    } catch (error) {
      setMessage("Erreur : " + error.message);
    }
  };

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: "420px" }}>
        <h1 className="title has-text-centered">Inscription</h1>

        <div className="box">
          <form onSubmit={handleRegister}>
            <div className="field">
              <label className="label">Nom d'affichage</label>
              <div className="control has-icons-left">
                <input
                  className="input"
                  type="text"
                  placeholder="Votre nom"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
                <span className="icon is-small is-left">
                  <i className="fas fa-user"></i>
                </span>
              </div>
            </div>

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
                Créer un compte
              </button>
            </div>
          </form>

          <div className="has-text-centered" style={{ margin: "1rem 0" }}>
            — ou —
          </div>

          <div className="field">
            <button
              className="button is-dark is-fullwidth"
              type="button"
              onClick={() => handleSocialRegister("google")}
            >
              Continuer avec Google
            </button>
          </div>

          <div className="field">
            <button
              className="button is-black is-fullwidth"
              type="button"
              onClick={() => handleSocialRegister("github")}
            >
              Continuer avec GitHub
            </button>
          </div>

          <div className="field">
            <button
              className="button is-info is-fullwidth"
              type="button"
              onClick={() => handleSocialRegister("facebook")}
            >
              Continuer avec Facebook
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
