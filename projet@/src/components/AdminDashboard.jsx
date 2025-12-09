import { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { firestore } from "../firebase";

const emptyBuilder = {
  name: "",
  session: "",
  questions: [],
};

const statusLabels = {
  soumis: "Soumis",
  approuve: "Approuve",
  corrections: "A corriger",
};

const statusClass = (value) => {
  if (!value) return "status-soumis";
  const normalized = value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return `status-${normalized || "soumis"}`;
};

function generateQuestionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

export default function AdminDashboard({ user }) {
  const [forms, setForms] = useState([]);
  const [builder, setBuilder] = useState(emptyBuilder);
  const [editingFormId, setEditingFormId] = useState(null);
  const [builderMessage, setBuilderMessage] = useState("");
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [reviewComment, setReviewComment] = useState("");
  const [filters, setFilters] = useState({
    teacher: "",
    status: "",
    session: "",
  });

  useEffect(() => {
    const q = query(
      collection(firestore, "forms"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const nextForms = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setForms(nextForms);
      if (editingFormId) {
        const current = nextForms.find((form) => form.id === editingFormId);
        if (!current) {
          handleResetBuilder();
        }
      }
    });
    return () => unsub();
  }, [editingFormId]);

  useEffect(() => {
    const q = query(
      collection(firestore, "coursePlans"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const nextPlans = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setPlans(nextPlans);
      setSelectedPlan((current) => {
        if (!current) return null;
        const refreshed = nextPlans.find((plan) => plan.id === current.id);
        if (refreshed) {
          setReviewComment(refreshed.reviewComment || "");
          return refreshed;
        }
        return null;
      });
    });
    return () => unsub();
  }, []);

  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => {
      const teacherMatches =
        !filters.teacher ||
        plan.teacherEmail
          ?.toLowerCase()
          .includes(filters.teacher.toLowerCase()) ||
        plan.teacherName?.toLowerCase().includes(filters.teacher.toLowerCase());
      const statusMatches = !filters.status || plan.status === filters.status;
      const sessionMatches =
        !filters.session ||
        plan.session?.toLowerCase() === filters.session.toLowerCase();
      return teacherMatches && statusMatches && sessionMatches;
    });
  }, [filters, plans]);

  const handleResetBuilder = () => {
    setBuilder(emptyBuilder);
    setEditingFormId(null);
    setBuilderMessage("");
  };

  const handleAddQuestion = () => {
    setBuilder((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        { id: generateQuestionId(), text: "", rule: "" },
      ],
    }));
  };

  const handleQuestionChange = (questionId, field, value) => {
    setBuilder((prev) => ({
      ...prev,
      questions: prev.questions.map((question) =>
        question.id === questionId ? { ...question, [field]: value } : question
      ),
    }));
  };

  const handleDeleteQuestion = (questionId) => {
    setBuilder((prev) => ({
      ...prev,
      questions: prev.questions.filter(
        (question) => question.id !== questionId
      ),
    }));
  };

  const builderIsValid =
    builder.name.trim() &&
    builder.session.trim() &&
    builder.questions.length >= 10 &&
    builder.questions.every((question) => question.text.trim());

  const handleSaveForm = async () => {
    if (!builderIsValid) {
      setBuilderMessage(
        "Veuillez completer le nom, la session et au moins 10 questions."
      );
      return;
    }
    setBuilderMessage("");
    const payload = {
      name: builder.name.trim(),
      session: builder.session.trim(),
      questions: builder.questions.map((question) => ({
        ...question,
        text: question.text.trim(),
        rule: question.rule.trim(),
      })),
      isActive: builder.isActive ?? false,
      updatedAt: serverTimestamp(),
    };
    try {
      if (editingFormId) {
        await updateDoc(doc(firestore, "forms", editingFormId), payload);
        setBuilderMessage("Formulaire mis a jour.");
      } else {
        await addDoc(collection(firestore, "forms"), {
          ...payload,
          isActive: false,
          createdAt: serverTimestamp(),
        });
        setBuilderMessage("Nouveau formulaire cree.");
      }
      handleResetBuilder();
    } catch (error) {
      console.error("handleSaveForm", error);
      setBuilderMessage("Erreur lors de la sauvegarde du formulaire.");
    }
  };

  const handleEditForm = (form) => {
    setEditingFormId(form.id);
    setBuilder({
      name: form.name || "",
      session: form.session || "",
      questions: (form.questions || []).map((question) => ({
        id: question.id || generateQuestionId(),
        text: question.text || "",
        rule: question.rule || "",
      })),
      isActive: form.isActive || false,
    });
    setBuilderMessage("");
  };

  const handleDeleteForm = async (formId) => {
    if (!window.confirm("Supprimer ce formulaire ?")) return;
    try {
      await deleteDoc(doc(firestore, "forms", formId));
      if (formId === editingFormId) {
        handleResetBuilder();
      }
    } catch (error) {
      console.error("handleDeleteForm", error);
      setBuilderMessage("Suppression impossible.");
    }
  };

  const handleToggleActive = async (targetForm) => {
    try {
      await updateDoc(doc(firestore, "forms", targetForm.id), {
        isActive: !targetForm.isActive,
      });
    } catch (error) {
      console.error("handleToggleActive", error);
    }
  };

  const handlePlanSelection = (plan) => {
    setSelectedPlan(plan);
    setReviewComment(plan.reviewComment || "");
  };

  const handlePlanDecision = async (nextStatus) => {
    if (!selectedPlan) return;
    try {
      await updateDoc(doc(firestore, "coursePlans", selectedPlan.id), {
        status: nextStatus,
        reviewComment: reviewComment.trim(),
        reviewerName: user?.displayName || user?.email || "Coordonnateur",
        updatedAt: serverTimestamp(),
      });
      setSelectedPlan(null);
      setReviewComment("");
    } catch (error) {
      console.error("handlePlanDecision", error);
    }
  };

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="panel-label">Gestion des formulaires</p>
            <h2>Creer ou modifier un formulaire</h2>
          </div>
          <div className="panel-actions">
            {editingFormId && (
              <button className="ghost-button" onClick={handleResetBuilder}>
                Annuler
              </button>
            )}
            <button
              className="primary-button"
              onClick={handleSaveForm}
              disabled={!builderIsValid}
            >
              {editingFormId ? "Mettre a jour" : "Creer le formulaire"}
            </button>
          </div>
        </header>

        <div className="form-grid">
          <label>
            Nom du formulaire
            <input
              type="text"
              value={builder.name}
              onChange={(event) =>
                setBuilder((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </label>
          <label>
            Session
            <input
              type="text"
              placeholder="Hiver 2025"
              value={builder.session}
              onChange={(event) =>
                setBuilder((prev) => ({ ...prev, session: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="question-list">
          <div className="panel-label">
            Questions ({builder.questions.length})
          </div>
          {builder.questions.map((question, index) => (
            <div key={question.id} className="question-item">
              <span className="question-index">{index + 1}.</span>
              <div className="question-fields">
                <input
                  type="text"
                  placeholder="Texte de la question"
                  value={question.text}
                  onChange={(event) =>
                    handleQuestionChange(
                      question.id,
                      "text",
                      event.target.value
                    )
                  }
                />
                <input
                  type="text"
                  placeholder="Regle IA (ex.: mentionner les objectifs du cours)"
                  value={question.rule}
                  onChange={(event) =>
                    handleQuestionChange(
                      question.id,
                      "rule",
                      event.target.value
                    )
                  }
                />
              </div>
              <button
                className="ghost-button"
                onClick={() => handleDeleteQuestion(question.id)}
              >
                Retirer
              </button>
            </div>
          ))}
          <button className="secondary-button" onClick={handleAddQuestion}>
            Ajouter une question
          </button>
        </div>
        {builderMessage && <p className="hint">{builderMessage}</p>}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="panel-label">Formulaires enregistres</p>
            <h2>Activer, modifier ou supprimer</h2>
          </div>
        </header>
        {forms.length === 0 ? (
          <p className="hint">Aucun formulaire n'a encore ete cree.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Session</th>
                  <th>Questions</th>
                  <th>Actif</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id}>
                    <td>{form.name}</td>
                    <td>{form.session}</td>
                    <td>{form.questions?.length || 0}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          form.isActive ? "status-success" : ""
                        }`}
                      >
                        {form.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="table-actions">
                      <button
                        className="ghost-button"
                        onClick={() => handleEditForm(form)}
                      >
                        Modifier
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => handleToggleActive(form)}
                      >
                        {form.isActive ? "Desactiver" : "Activer"}
                      </button>
                      <button
                        className="danger-button"
                        onClick={() => handleDeleteForm(form.id)}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="panel-label">Plans soumis</p>
            <h2>Validation et filtrage</h2>
          </div>
        </header>

        <div className="filter-grid">
          <label>
            Enseignant
            <input
              type="text"
              placeholder="Nom ou email"
              value={filters.teacher}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, teacher: event.target.value }))
              }
            />
          </label>
          <label>
            Statut
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value }))
              }
            >
              <option value="">Tous</option>
              <option value="soumis">Soumis</option>
              <option value="approuve">Approuve</option>
              <option value="corrections">A corriger</option>
            </select>
          </label>
          <label>
            Session
            <input
              type="text"
              placeholder="Hiver 2025"
              value={filters.session}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, session: event.target.value }))
              }
            />
          </label>
        </div>

        {filteredPlans.length === 0 ? (
          <p className="hint">
            Aucun plan ne correspond aux filtres selectionnes.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Enseignant</th>
                  <th>Session</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{plan.formName}</td>
                    <td>
                      <div className="stacked">
                        <strong>{plan.teacherName}</strong>
                        <span className="hint">{plan.teacherEmail}</span>
                      </div>
                    </td>
                    <td>{plan.session}</td>
                    <td>
                      <span
                        className={`status-pill ${statusClass(
                          plan.status || "soumis"
                        )}`}
                      >
                        {statusLabels[plan.status] || "Soumis"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="ghost-button"
                        onClick={() => handlePlanSelection(plan)}
                      >
                        Voir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedPlan && (
          <div className="plan-detail">
            <header>
              <div>
                <p className="panel-label">Plan selectionne</p>
                <h3>{selectedPlan.formName}</h3>
                <p className="hint">
                  {selectedPlan.teacherName} - {selectedPlan.teacherEmail}
                </p>
              </div>
              <button
                className="ghost-button"
                onClick={() => setSelectedPlan(null)}
              >
                Fermer
              </button>
            </header>

            <div className="answer-list">
              {selectedPlan.answers?.map((answer, index) => (
                <article
                  key={answer.questionId || index}
                  className="answer-card"
                >
                  <div className="answer-card-header">
                    <h4>
                      {index + 1}. {answer.prompt}
                    </h4>
                    <span
                      className={`status-pill ${statusClass(
                        answer.aiStatus || "soumis"
                      )}`}
                    >
                      {answer.aiStatus || "N/A"}
                    </span>
                  </div>
                  <p>{answer.response}</p>
                  {answer.aiFeedback && (
                    <p className="hint">Suggestion IA : {answer.aiFeedback}</p>
                  )}
                  {answer.aiHighlights?.length > 0 && (
                    <p className="hint">
                      Points verifies : {answer.aiHighlights.join(", ")}
                    </p>
                  )}
                  {answer.aiEngine && (
                    <p className="hint">
                      Moteur : {answer.aiEngine}
                      {answer.aiModel ? ` (${answer.aiModel})` : ""}
                    </p>
                  )}
                </article>
              ))}
            </div>

            <div className="review-actions">
              <label>
                Commentaire au professeur
                <textarea
                  rows={3}
                  placeholder="Ajoutez des pistes de correction ou des felicitations."
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                />
              </label>
              <div className="panel-actions">
                {selectedPlan.pdfUrl ? (
                  <a
                    className="ghost-button"
                    href={selectedPlan.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Telecharger le PDF
                  </a>
                ) : (
                  <span className="hint">PDF non disponible</span>
                )}
                <button
                  className="secondary-button"
                  onClick={() => handlePlanDecision("corrections")}
                >
                  Demander des corrections
                </button>
                <button
                  className="primary-button"
                  onClick={() => handlePlanDecision("approuve")}
                >
                  Approuver le plan
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
