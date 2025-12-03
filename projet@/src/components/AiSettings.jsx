import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, firestore } from "../firebase";
import { ADMIN_EMAILS } from "../constants/roles";

const AI_OPTIONS = [
  {
    id: "chatgpt",
    title: "ChatGPT API",
    description:
      "Utilise les modèles d'OpenAI pour analyser le contenu des plans et produire des recommandations personnalisées.",
    highlights: [
      "Analyse contextuelle avancée",
      "Réponses très détaillées",
      "Requiert une clé API OpenAI et un budget",
    ],
  },
  {
    id: "firebase-ml",
    title: "Firebase ML Kit",
    description:
      "Déploie des modèles légers directement dans l'écosystème Firebase pour appliquer des règles pré-définies.",
    highlights: [
      "Intégration native Firebase",
      "Faible latence et coûts",
      "Idéal pour des règles structurées",
    ],
  },
];

const docRef = doc(firestore, "settings", "ai");

export default function AiSettings() {
  const [user, setUser] = useState(null);
  const [currentEngine, setCurrentEngine] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedBy, setUpdatedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => setUser(authUser));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setCurrentEngine(data.engine || "");
        setUpdatedAt(data.updatedAt || null);
        setUpdatedBy(data.updatedBy || "");
      } else {
        setCurrentEngine("");
        setUpdatedAt(null);
        setUpdatedBy("");
      }
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = useMemo(
    () => Boolean(user?.email && ADMIN_EMAILS.includes(user.email)),
    [user]
  );

  const handleSelect = async (engineId) => {
    if (!isAdmin) return;
    setSaving(true);
    setMessage("");
    try {
      await setDoc(
        docRef,
        {
          engine: engineId,
          updatedAt: serverTimestamp(),
          updatedBy: user?.email || user?.displayName || "Coordonnateur",
        },
        { merge: true }
      );
      setMessage("Option IA mise à jour avec succès.");
    } catch (error) {
      console.error("handleSelect", error);
      setMessage("Échec de l'enregistrement. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  const renderTimestamp = () => {
    if (!updatedAt?.toDate) return "Jamais configuré";
    return updatedAt.toDate().toLocaleString("fr-CA");
  };

  return (
    <main className="app-shell">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="panel-label">Configuration IA</p>
            <h1>Choisir le moteur de validation</h1>
            <p className="hint">
              Sélectionnez l&apos;option utilisée pour l&apos;analyse automatique des plans
              de cours. Un seul moteur est actif à la fois.
            </p>
          </div>
        </header>

        {!isAdmin && (
          <div className="hint">
            Seuls les coordonnateurs peuvent modifier l&apos;option IA. La sélection
            actuelle est affichée ci-dessous.
          </div>
        )}

        <div className="ai-options-grid">
          {AI_OPTIONS.map((option) => {
            const isActive = option.id === currentEngine;
            return (
              <article
                key={option.id}
                className={`ai-card ${isActive ? "ai-card-active" : ""}`}
              >
                <div>
                  <p className="panel-label">Option</p>
                  <h3>{option.title}</h3>
                  <p className="hint">{option.description}</p>
                  <ul className="ai-list">
                    {option.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                </div>
                <div className="panel-actions">
                  <span className="status-pill">{isActive ? "Actuel" : "Disponible"}</span>
                  <button
                    className="primary-button"
                    disabled={!isAdmin || saving || isActive}
                    onClick={() => handleSelect(option.id)}
                  >
                    {isActive ? "Sélectionnée" : "Activer cette option"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {message && <p className="hint">{message}</p>}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="panel-label">Historique</p>
            <h2>Dernière modification</h2>
          </div>
        </header>
        <p>
          Option actuelle :{" "}
          <strong>
            {AI_OPTIONS.find((option) => option.id === currentEngine)?.title ||
              "Non définie"}
          </strong>
        </p>
        <p>Mis à jour par : {updatedBy || "—"}</p>
        <p>Le : {renderTimestamp()}</p>
      </section>
    </main>
  );
}
