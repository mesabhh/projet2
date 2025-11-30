import React, { useEffect, useState } from "react";
import { auth, storage } from "./firebase";
import {
  onAuthStateChanged,
  updateProfile,
  linkWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const ProfilePage = () => {
  const [user, setUser] = useState(null);
  const [photoURL, setPhotoURL] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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

  if (!user) return <div className="container mt-6">Chargement...</div>;

  return (
    <div className="container is-max-desktop mt-6">
      <div className="box">
        <h2 className="title is-4 has-text-centered mb-4">
          Profil utilisateur
        </h2>
        <div className="has-text-centered mb-4">
          <figure className="image is-128x128 is-inline-block">
            <img className="is-rounded" src={photoURL} alt="avatar" />
          </figure>
        </div>
        <div className="field">
          <label className="label">Changer la photo de profil</label>
          <div className="control">
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              disabled={uploading}
            />
          </div>
        </div>
        <div className="field">
          <label className="label">Adresse e-mail</label>
          <div className="control">
            <input className="input" type="email" value={email} disabled />
          </div>
        </div>
        <div className="field">
          <label className="label">Type de compte</label>
          <div className="control">
            <input className="input" type="text" value={accountType} disabled />
          </div>
        </div>
        {error && (
          <div className="notification is-danger is-light mt-3">{error}</div>
        )}
        {success && (
          <div className="notification is-success is-light mt-3">{success}</div>
        )}
        {user.isAnonymous && (
          <div className="box mt-5">
            <h3 className="subtitle is-5">Convertir le compte anonyme</h3>
            <form onSubmit={handleConvert}>
              <div className="field">
                <label className="label">E-mail</label>
                <div className="control">
                  <input
                    className="input"
                    type="email"
                    value={convertEmail}
                    onChange={(e) => setConvertEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label className="label">Mot de passe</label>
                <div className="control">
                  <input
                    className="input"
                    type="password"
                    value={convertPassword}
                    onChange={(e) => setConvertPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label className="label">Confirmer le mot de passe</label>
                <div className="control">
                  <input
                    className="input"
                    type="password"
                    value={convertConfirm}
                    onChange={(e) => setConvertConfirm(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button className="button is-primary mt-2" type="submit">
                Convertir
              </button>
            </form>
            {convertError && (
              <div className="notification is-danger is-light mt-3">
                {convertError}
              </div>
            )}
            {convertSuccess && (
              <div className="notification is-success is-light mt-3">
                {convertSuccess}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
