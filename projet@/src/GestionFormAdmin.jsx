import React, { useEffect, useMemo, useState } from "react";
import { firestore } from "./firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

const makeEmptyQuestion = () => ({ text: "", rule: "" });

const GestionFormAdmin = () => {
  const [forms, setForms] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [questions, setQuestions] = useState([makeEmptyQuestion()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  // Subscribe to forms
  useEffect(() => {
    const unsub = onSnapshot(
      collection(firestore, "forms"),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        list.sort((a, b) => {
          const aDate = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
          const bDate = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
          return bDate - aDate;
        });
        setForms(list);
        setLoading(false);
      },
      (err) => {
        setError("Erreur lors du chargement : " + err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Sync editor when a form is selected
  useEffect(() => {
    if (!selectedFormId) return;
    const found = forms.find((f) => f.id === selectedFormId);
    if (!found) return;
    setFormName(found.name || "");
    setFormDescription(found.description || "");
    setQuestions(
      found.questions?.length
        ? found.questions.map((q) => ({
            text: q.text || "",
            rule: q.rule || "",
          }))
        : [makeEmptyQuestion()]
    );
  }, [selectedFormId, forms]);

  const activeFormId = useMemo(
    () => forms.find((f) => f.isActive)?.id || null,
    [forms]
  );

  const resetEditor = (clearMessages = true) => {
    setSelectedFormId(null);
    setFormName("");
    setFormDescription("");
    setQuestions([makeEmptyQuestion()]);
    if (clearMessages) {
      setFeedback("");
      setError("");
    }
  };

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, makeEmptyQuestion()]);
  };

  const handleUpdateQuestion = (index, key, value) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [key]: value } : q))
    );
  };

  const handleDeleteQuestion = (index) => {
    setQuestions((prev) => {
      if (prev.length === 1) return [makeEmptyQuestion()];
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSaveForm = async () => {
    setSaving(true);
    setError("");
    setFeedback("");

    const name = formName.trim();
    const description = formDescription.trim();
    const cleanedQuestions = questions
      .map((q) => ({
        text: q.text.trim(),
        rule: q.rule.trim(),
      }))
      .filter((q) => q.text.length > 0);

    if (!name) {
      setError("Le formulaire doit avoir un titre.");
      setSaving(false);
      return;
    }
    if (cleanedQuestions.length < 10) {
      setError("Ajoutez au moins 10 questions avec leur texte.");
      setSaving(false);
      return;
    }

    const payload = {
      name,
      description,
      questions: cleanedQuestions,
      updatedAt: serverTimestamp(),
    };

    try {
      if (selectedFormId) {
        await updateDoc(doc(firestore, "forms", selectedFormId), payload);
        setFeedback("Formulaire mis a jour.");
      } else {
        await addDoc(collection(firestore, "forms"), {
          ...payload,
          isActive: false,
          createdAt: serverTimestamp(),
        });
        setFeedback("Nouveau formulaire cree.");
        resetEditor(false);
      }
    } catch (err) {
      setError("Erreur lors de l'enregistrement : " + err.message);
    }

    setSaving(false);
  };

  const handleSelectForm = (id) => {
    setSelectedFormId(id);
    setFeedback("");
    setError("");
  };

  const handleDeleteForm = async (id) => {
    const toDelete = forms.find((f) => f.id === id);
    if (!toDelete) return;
    const confirmDelete = window.confirm(
      `Supprimer definitivement "${toDelete.name}" ?`
    );
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(firestore, "forms", id));
      if (selectedFormId === id) resetEditor(false);
      setError("");
      setFeedback("Formulaire supprime.");
    } catch (err) {
      setError("Suppression impossible : " + err.message);
    }
  };

  const handleActivateForm = async (targetId) => {
    const formIdToActivate = targetId || selectedFormId;
    if (!formIdToActivate) return;
    setSelectedFormId(formIdToActivate);
    setActivating(true);
    setError("");
    setFeedback("");
    try {
      const snapshot = await getDocs(collection(firestore, "forms"));
      const batch = writeBatch(firestore);
      snapshot.forEach((docSnap) => {
        const isTarget = docSnap.id === formIdToActivate;
        batch.update(docSnap.ref, {
          isActive: isTarget,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      setFeedback("Formulaire active.");
    } catch (err) {
      setError("Activation impossible : " + err.message);
    }
    setActivating(false);
  };

  const formatDate = (timestamp) => {
    if (!timestamp?.toDate) return "-";
    return timestamp
      .toDate()
      .toLocaleString("fr-CA", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
  };

  return (
    <div className="admin-page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Admin | Plan de cours</p>
          <h1>Gestion des formulaires</h1>
          <p className="lede">
            Creez le modele de formulaire, ajoutez vos questions et definissez la regle IA par question.
            Activez la version qui doit etre utilisee cote etudiants.
          </p>
          <div className="hero-actions">
            <button className="btn primary" onClick={resetEditor}>
              + Nouveau formulaire
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                if (forms.length) {
                  setSelectedFormId(forms[0].id);
                  setError("");
                  setFeedback("");
                }
              }}
              disabled={!forms.length}
            >
              Charger le dernier
            </button>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="label">Formulaires</span>
            <span className="value">{forms.length}</span>
            <span className="hint">total</span>
          </div>
          <div className="stat">
            <span className="label">Actif</span>
            <span className="value">{activeFormId ? "Oui" : "Non"}</span>
            <span className="hint">
              {activeFormId
                ? forms.find((f) => f.id === activeFormId)?.name || "Formulaire actif"
                : "Aucun formulaire actif"}
            </span>
          </div>
          <div className="stat">
            <span className="label">Questions</span>
            <span className="value">{questions.length}</span>
            <span className="hint">dans l'editeur</span>
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="card list">
          <div className="card-header">
            <div>
              <p className="eyebrow">Vos modeles</p>
              <h2>Formulaires</h2>
            </div>
            <button className="btn ghost" onClick={resetEditor}>
              Nouveau
            </button>
          </div>

          {loading && <div className="muted">Chargement...</div>}
          {!loading && forms.length === 0 && (
            <div className="muted">Aucun formulaire cree pour l'instant.</div>
          )}

          <div className="form-list">
            {forms.map((form) => (
              <div
                key={form.id}
                className={`form-item ${selectedFormId === form.id ? "selected" : ""}`}
              >
                <div className="form-item-main">
                  <div>
                    <div className="form-title">{form.name}</div>
                    <div className="form-meta">
                      {form.questions?.length || 0} question(s) | MAJ{" "}
                      {formatDate(form.updatedAt || form.createdAt)}
                    </div>
                  </div>
                  <div className="pills">
                    <span className={`pill ${form.isActive ? "pill-active" : "pill-draft"}`}>
                      {form.isActive ? "Actif" : "Brouillon"}
                    </span>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn small" onClick={() => handleSelectForm(form.id)}>
                    Modifier
                  </button>
                  <button
                    className="btn small ghost"
                    onClick={() => handleActivateForm(form.id)}
                    disabled={form.isActive}
                  >
                    Activer
                  </button>
                  <button
                    className="btn small danger ghost"
                    onClick={() => handleDeleteForm(form.id)}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card editor">
          <div className="card-header">
            <div>
              <p className="eyebrow">
                {selectedFormId ? "Edition" : "Nouveau formulaire"}
              </p>
              <h2>{selectedFormId ? "Mettre a jour" : "Creer"} le modele</h2>
            </div>
            {selectedFormId && (
              <span
                className={`pill ${activeFormId === selectedFormId ? "pill-active" : "pill-draft"}`}
              >
                {activeFormId === selectedFormId ? "Actif" : "Brouillon"}
              </span>
            )}
          </div>

          {feedback && <div className="banner success">{feedback}</div>}
          {error && <div className="banner danger">{error}</div>}

          <div className="field">
            <label>Nom du formulaire</label>
            <input
              type="text"
              placeholder="Ex. Plan de cours - session Hiver"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Description (optionnel)</label>
            <textarea
              rows="2"
              placeholder="Objectif, public cible, notes internes."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            ></textarea>
          </div>

          <div className="field split">
            <div className="field-inline">
              <label>Nombre de questions</label>
              <div className="count">{questions.length}</div>
            </div>
            <button className="btn ghost" onClick={handleAddQuestion}>
              + Ajouter une question
            </button>
          </div>

          <div className="questions">
            {questions.map((question, index) => (
              <div className="question-card" key={index}>
                <div className="question-head">
                  <div className="bubble">Q{index + 1}</div>
                  <button
                    className="btn small ghost"
                    onClick={() => handleDeleteQuestion(index)}
                  >
                    Supprimer
                  </button>
                </div>
                <div className="field">
                  <label>Texte de la question</label>
                  <input
                    type="text"
                    placeholder="Saisissez l'intitule pour l'etudiant"
                    value={question.text}
                    onChange={(e) => handleUpdateQuestion(index, "text", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Regle IA</label>
                  <textarea
                    rows="2"
                    placeholder="Ex. Attendre un texte de 2-3 phrases, verifier la presence des prerequis."
                    value={question.rule}
                    onChange={(e) => handleUpdateQuestion(index, "rule", e.target.value)}
                  ></textarea>
                </div>
              </div>
            ))}
          </div>

          <div className="editor-actions">
            <button className="btn primary" onClick={handleSaveForm} disabled={saving}>
              {saving ? "Sauvegarde..." : "Sauvegarder le formulaire"}
            </button>
            <button
              className="btn ghost"
              onClick={handleActivateForm}
              disabled={!selectedFormId || activating}
            >
              {activating ? "Activation..." : "Activer ce formulaire"}
            </button>
            {selectedFormId && (
              <button className="btn ghost danger" onClick={() => handleDeleteForm(selectedFormId)}>
                Supprimer le brouillon
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default GestionFormAdmin;
