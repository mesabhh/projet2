import React, { useEffect, useMemo, useState } from "react";
import { auth, storage, firestore } from "./firebase";
import {
  onAuthStateChanged,
  updateProfile,
  linkWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, onSnapshot } from "firebase/firestore";

const ProfilePage = () => {
  const [user, setUser] = useState(null);
  const [photoURL, setPhotoURL] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState("");
  const [role, setRole] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  // For anonymous conversion
  const [convertEmail, setConvertEmail] = useState("");
  const [convertPassword, setConvertPassword] = useState("");
  const [convertConfirm, setConvertConfirm] = useState("");
  const [convertError, setConvertError] = useState("");
  const [convertSuccess, setConvertSuccess] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log("onAuthStateChanged", u);
      setUser(u);
      if (u) {
        const placeholder =
          "https://hds.hel.fi/images/foundation/visual-assets/placeholders/user-image-l@3x.png";
        setPhotoURL(u.photoURL && u.photoURL !== "" ? u.photoURL : placeholder);
        setEmail(u.email || "");
        if (u.isAnonymous) {
          setAccountType("anonyme");
        } else if (u.providerData[0]?.providerId === "password") {
          setAccountType("e-mail");
        } else {
          setAccountType("Google");
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userRef = doc(firestore, "users", user.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        setRole(snapshot.data().role || "");
      }
    });
    return () => unsubscribe();
  }, [user]);

  const handlePhotoUpload = async (e) => {
    setError("");
    setSuccess("");
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const storageRef = ref(
        storage,
        `profile-images/${user.uid}/${file.name}`
      );
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateProfile(user, { photoURL: url });
      setPhotoURL(url);
      setSuccess("Photo de profil mise à jour !");
    } catch (err) {
      setError("Erreur lors du téléversement : " + err.message);
    }
    setUploading(false);
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    setConvertError("");
    setConvertSuccess("");
    if (convertPassword !== convertConfirm) {
      setConvertError("Les mots de passe ne correspondent pas");
      return;
    }
    try {
      const credential = EmailAuthProvider.credential(
        convertEmail,
        convertPassword
      );
      const userCred = await linkWithCredential(user, credential);
      await sendEmailVerification(userCred.user);
      setConvertSuccess("Compte converti ! Vérifiez votre e-mail.");
    } catch (err) {
      setConvertError(err.message);
    }
  };

  const handleEmailVerification = async () => {
    if (!user) return;
    setVerificationMessage("");
    try {
      await sendEmailVerification(user);
      setVerificationMessage("Courriel de vérification envoyé.");
    } catch (err) {
      setVerificationMessage("Erreur : " + err.message);
    }
  };

  const formattedDate = useMemo(() => {
    if (!user?.metadata?.creationTime) return "—";
    return new Date(user.metadata.creationTime).toLocaleDateString("fr-CA");
  }, [user]);

  if (!user) return <div className="page-loader">Chargement du profil…</div>;

  return (
    <section className="profile-layout">
      <div className="profile-hero">
        <div>
          <p className="panel-label">Mon profil</p>
          <h1>{user.displayName || "Utilisateur"}</h1>
          <p className="hint">
            Membre depuis le {formattedDate}. Votre rôle détermine l&apos;interface proposée.
          </p>
        </div>
        <div className="profile-badges">
          {role && (
            <span className={`status-pill ${role === "admin" ? "status-success" : ""}`}>
              {role}
            </span>
          )}
          <span className="status-pill">{accountType}</span>
          <span
            className={`status-pill ${
              user.emailVerified ? "status-success" : "status-a-ameliorer"
            }`}
          >
            {user.emailVerified ? "Email vérifié" : "Email à vérifier"}
          </span>
        </div>
      </div>

      <div className="profile-grid">
        <div className="profile-card">
          <div className="profile-avatar">
            <img src={photoURL} alt="avatar" />
            <div>
              <p className="panel-label">Avatar</p>
              <p>{email}</p>
              <p className="hint">{user.uid}</p>
            </div>
          </div>
          <label className="upload-field">
            Mettre à jour la photo
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              disabled={uploading}
            />
          </label>
          {error && <p className="hint" style={{ color: "#fca5a5" }}>{error}</p>}
          {success && (
            <p className="hint" style={{ color: "#bbf7d0" }}>
              {success}
            </p>
          )}
        </div>

        <div className="profile-card">
          <h3>Informations de sécurité</h3>
          <p>Fournisseur : {user.providerData[0]?.providerId || "—"}</p>
          <p>Adresse e-mail : {email}</p>
          <p>Rôle Firestore : {role || "Non défini"}</p>
          <div className="profile-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={handleEmailVerification}
              disabled={user.emailVerified}
            >
              {user.emailVerified ? "Adresse confirmée" : "Envoyer un email de vérification"}
            </button>
          </div>
          {verificationMessage && <p className="hint">{verificationMessage}</p>}
        </div>

        {user.isAnonymous && (
          <div className="profile-card">
            <h3>Convertir mon compte</h3>
            <form onSubmit={handleConvert} className="auth-form">
              <label>
                E-mail
                <input
                  type="email"
                  value={convertEmail}
                  onChange={(e) => setConvertEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                Mot de passe
                <input
                  type="password"
                  value={convertPassword}
                  onChange={(e) => setConvertPassword(e.target.value)}
                  required
                />
              </label>
              <label>
                Confirmation
                <input
                  type="password"
                  value={convertConfirm}
                  onChange={(e) => setConvertConfirm(e.target.value)}
                  required
                />
              </label>
              <button className="primary-button" type="submit">
                Convertir le compte
              </button>
            </form>
            {convertError && <p className="hint" style={{ color: "#fca5a5" }}>{convertError}</p>}
            {convertSuccess && (
              <p className="hint" style={{ color: "#bbf7d0" }}>{convertSuccess}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default ProfilePage;
