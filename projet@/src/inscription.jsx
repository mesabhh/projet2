import React, { useMemo, useState } from "react";
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
import { Link, useNavigate } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";

const ROLES = {
  admin: {
    title: "Coordonnateur",
    description: "Crée des formulaires, valide les plans et publie les décisions.",
  },
  enseignant: {
    title: "Enseignant",
    description: "Complète le formulaire actif et soumet son plan pour validation.",
  },
};

const providerMap = {
  google: googleProvider,
  github: githubProvider,
  facebook: facebookProvider,
};

export default function Inscription() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState("enseignant");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const roleInfo = useMemo(() => ROLES[selectedRole], [selectedRole]);

  const saveUserToFirestore = async (user, role) => {
    if (!user) return;
    const userRef = doc(firestore, "users", user.uid);
    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email,
        role,
      },
      { merge: true }
    );
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await updateProfile(user, { displayName });
      await saveUserToFirestore(user, selectedRole);
      await sendEmailVerification(user);
      setMessage(
        "Compte créé avec succès ! Vérifiez vos courriels pour activer votre accès."
      );
      navigate("/connexion");
    } catch (error) {
      setMessage("Erreur : " + error.message);
    }
  };

  const handleSocialRegister = async (providerName) => {
    const provider = providerMap[providerName];
    if (!provider) return;
    setMessage("");
    try {
      const result = await signInWithPopup(auth, provider);
      await updateProfile(result.user, { displayName: displayName || result.user.displayName });
      await saveUserToFirestore(result.user, selectedRole);
      navigate("/");
    } catch (error) {
      setMessage("Erreur : " + error.message);
    }
  };

  return (
    <section className="auth-layout">
      <div className="auth-hero">
        <p className="panel-label">Créer un compte</p>
        <h1>Bienvenue sur la plateforme</h1>
        <p className="hint">
          Sélectionnez votre rôle pour que nous configurions automatiquement les bonnes
          autorisations dans Firestore.
        </p>
        <div className="role-options">
          {Object.entries(ROLES).map(([key, role]) => (
            <button
              key={key}
              type="button"
              className={`role-option ${
                selectedRole === key ? "role-option-active" : ""
              }`}
              onClick={() => setSelectedRole(key)}
            >
              <div>
                <p className="panel-label">{role.title}</p>
                <h3>{role.title}</h3>
                <p className="hint">{role.description}</p>
              </div>
              {selectedRole === key && <span className="status-pill">Sélectionné</span>}
            </button>
          ))}
        </div>
        <div className="test-credentials">
          <p className="label">Astuce</p>
          <p>Vous pouvez créer des comptes de démonstration distincts pour chaque rôle.</p>
        </div>
      </div>

      <div className="auth-panel">
        <h2>Inscription {roleInfo.title}</h2>
        <form onSubmit={handleRegister} className="auth-form">
          <label>
            Nom complet
            <input
              type="text"
              placeholder="Votre nom"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </label>
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
            Créer mon compte
          </button>
        </form>

        <div className="divider">
          <span>Ou continuez avec</span>
        </div>

        <div className="social-grid">
          <button
            className="ghost-button"
            type="button"
            onClick={() => handleSocialRegister("google")}
          >
            Google
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => handleSocialRegister("github")}
          >
            GitHub
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => handleSocialRegister("facebook")}
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
          Vous avez déjà un compte ?{" "}
          <Link to="/connexion" style={{ color: "#8dd7ff" }}>
            Retour à la connexion
          </Link>
        </p>
      </div>
    </section>
  );
}
