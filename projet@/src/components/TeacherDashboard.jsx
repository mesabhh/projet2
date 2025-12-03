import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firestore, storage } from "../firebase";

const statusLabels = {
  soumis: "Soumis",
  approuve: "Approuvé",
  corrections: "À corriger",
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

const STATUS_VALUES = ["Conforme", "À améliorer", "Non conforme"];

const sanitize = (value) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const wrapLine = (text, max = 90) => {
  const chunks = [];
  let remaining = text;
  while (remaining.length > max) {
    chunks.push(remaining.slice(0, max));
    remaining = remaining.slice(max);
  }
  if (remaining.length) {
    chunks.push(remaining);
  } else if (!chunks.length) {
    chunks.push("");
  }
  return chunks;
};

const buildPdfStream = (lines) => {
  const commands = ["BT", "/F1 12 Tf", "72 750 Td"];
  lines.forEach((line, index) => {
    if (index === 0) {
      commands.push(`(${sanitize(line)}) Tj`);
    } else {
      commands.push("T*");
      commands.push(`(${sanitize(line)}) Tj`);
    }
  });
  commands.push("ET");
  return commands.join("\n");
};

const createPdfBlob = (lines) => {
  const wrappedLines = lines.flatMap((line) => wrapLine(line));
  const textStream = buildPdfStream(wrappedLines);
  const contentStream = `<< /Length ${textStream.length} >>\nstream\n${textStream}\nendstream`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    contentStream,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((objectBody, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objectBody}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
};

const sanitizeFilename = (value) =>
  value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");

const runLocalAi = (response, rule) => {
  const clean = response.trim();
  if (!clean) {
    return {
      aiStatus: "Non conforme",
      aiFeedback: "La réponse est vide.",
    };
  }
  if (clean.length < 80) {
    return {
      aiStatus: "À améliorer",
      aiFeedback: "Ajoutez plus de détails (80 caractères minimum).",
    };
  }
  if (rule) {
    const keywords = rule.toLowerCase().split(/\s+/).slice(0, 2);
    const missingKeyword = keywords.find(
      (keyword) => keyword.length > 3 && !clean.toLowerCase().includes(keyword)
    );
    if (missingKeyword) {
      return {
        aiStatus: "À améliorer",
        aiFeedback: `Mentionnez l'élément suivant : "${missingKeyword}".`,
      };
    }
  }
  if (clean.length < 150) {
    return {
      aiStatus: "À améliorer",
      aiFeedback:
        "Structurez la réponse avec les objectifs, stratégies et évaluation.",
    };
  }
  return {
    aiStatus: "Conforme",
    aiFeedback: "Réponse suffisamment détaillée.",
  };
};

export default function TeacherDashboard({ user }) {
  const [activeForm, setActiveForm] = useState(null);
  const [answers, setAnswers] = useState({});
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);

  useEffect(() => {
    const q = query(
      collection(firestore, "forms"),
      where("isActive", "==", true),
      limit(1)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const docSnap = snapshot.docs[0];
      if (docSnap) {
        setActiveForm({ id: docSnap.id, ...docSnap.data() });
      } else {
        setActiveForm(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(firestore, "coursePlans"),
      where("teacherUid", "==", user.uid),
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
        return refreshed || null;
      });
    });
    return () => unsub();
  }, [user]);

  const progress = useMemo(() => {
    if (!activeForm?.questions?.length) return 0;
    const answered = activeForm.questions.filter((question) => {
      const entry = answers[question.id];
      return entry?.response?.trim();
    }).length;
    return Math.round((answered / activeForm.questions.length) * 100);
  }, [activeForm, answers]);

  const handleAnswerChange = (questionId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        response: value,
      },
    }));
  };

  const handleAnalyzeQuestion = (question) => {
    const entry = answers[question.id];
    if (!entry?.response?.trim()) {
      setMessage("Veuillez écrire votre réponse avant d'analyser.");
      return;
    }
    setAnalyzingId(question.id);
    setTimeout(() => {
      const evaluation = runLocalAi(entry.response, question.rule);
      setAnswers((prev) => ({
        ...prev,
        [question.id]: {
          ...entry,
          ...evaluation,
        },
      }));
      setAnalyzingId(null);
    }, 250);
  };

  const buildPlanLines = (answersPayload) => {
    const lines = [
      `Plan : ${activeForm?.name || "Sans nom"}`,
      `Enseignant : ${user?.displayName || user?.email}`,
      `Session : ${activeForm?.session || "N/D"}`,
      "",
    ];
    answersPayload.forEach((answer, index) => {
      lines.push(`${index + 1}. ${answer.prompt}`);
      lines.push(`Réponse : ${answer.response}`);
      lines.push(
        `Validation : ${answer.aiStatus} – ${answer.aiFeedback || "N/A"}`
      );
      lines.push("");
    });
    return lines;
  };

  const handleSubmitPlan = async () => {
    if (!activeForm || !activeForm.questions?.length) {
      setMessage("Aucun formulaire actif n'est disponible.");
      return;
    }
    const answersPayload = activeForm.questions.map((question) => {
      const entry = answers[question.id] || {};
      const response = entry.response?.trim() || "";
      const evaluation =
        entry.aiStatus && entry.aiFeedback
          ? entry
          : runLocalAi(response, question.rule);
      return {
        questionId: question.id,
        prompt: question.text,
        rule: question.rule,
        response,
        aiStatus: evaluation.aiStatus,
        aiFeedback: evaluation.aiFeedback,
      };
    });

    const missingAnswer = answersPayload.find((answer) => !answer.response);
    if (missingAnswer) {
      setMessage("Veuillez répondre à toutes les questions du formulaire.");
      return;
    }

    const summary = answersPayload.reduce(
      (accumulator, answer) => {
        if (answer.aiStatus === "Conforme") accumulator.conforme += 1;
        if (answer.aiStatus === "À améliorer") accumulator.ameliorer += 1;
        if (answer.aiStatus === "Non conforme") accumulator.nonConforme += 1;
        return accumulator;
      },
      { conforme: 0, ameliorer: 0, nonConforme: 0 }
    );

    const lines = buildPlanLines(answersPayload);
    const pdfBlob = createPdfBlob(lines);

    try {
      setSaving(true);
      const fileRef = ref(
        storage,
        `plans/${user.uid}/${Date.now()}-${sanitizeFilename(
          activeForm.name || "plan"
        )}.pdf`
      );
      await uploadBytes(fileRef, pdfBlob, { contentType: "application/pdf" });
      const pdfUrl = await getDownloadURL(fileRef);

      await addDoc(collection(firestore, "coursePlans"), {
        formId: activeForm.id,
        formName: activeForm.name,
        session: activeForm.session,
        answers: answersPayload,
        aiSummary: summary,
        status: "soumis",
        teacherUid: user.uid,
        teacherEmail: user.email,
        teacherName: user.displayName || "Enseignant",
        pdfUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAnswers({});
      setMessage("Plan envoyé pour validation. Vous recevrez un retour bientôt.");
    } catch (error) {
      console.error("handleSubmitPlan", error);
      setMessage("Impossible de soumettre le plan, réessayez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="panel-label">Formulaire actif</p>
            <h2>{activeForm?.name || "Aucun formulaire publié"}</h2>
            <p className="hint">
              Session : {activeForm?.session || "Non définie"} – Progression :{" "}
              {progress}%
            </p>
          </div>
          <button
            className="primary-button"
            onClick={handleSubmitPlan}
            disabled={!activeForm || saving}
          >
            {saving ? "Soumission…" : "Soumettre le plan"}
          </button>
        </header>

        {!activeForm ? (
          <p className="hint">
            Aucun formulaire n&apos;est disponible pour le moment. Revenez plus
            tard.
          </p>
        ) : (
          <div className="question-answer-list">
            {activeForm.questions.map((question) => {
              const entry = answers[question.id] || {};
              return (
                <article key={question.id} className="answer-card">
                  <div className="answer-card-header">
                    <div>
                      <h4>{question.text}</h4>
                      {question.rule && (
                        <p className="hint">Règle IA : {question.rule}</p>
                      )}
                    </div>
                    {entry.aiStatus && (
                      <span className={`status-pill ${statusClass(entry.aiStatus)}`}>
                        {entry.aiStatus}
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Saisissez votre réponse"
                    value={entry.response || ""}
                    onChange={(event) =>
                      handleAnswerChange(question.id, event.target.value)
                    }
                  />
                  <div className="panel-actions">
                    {entry.aiFeedback && (
                      <p className="hint">{entry.aiFeedback}</p>
                    )}
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => handleAnalyzeQuestion(question)}
                      disabled={analyzingId === question.id}
                    >
                      {analyzingId === question.id
                        ? "Analyse en cours…"
                        : "Analyser la réponse"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {message && <p className="hint">{message}</p>}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="panel-label">Mes plans</p>
            <h2>Historique des soumissions</h2>
          </div>
        </header>
        {plans.length === 0 ? (
          <p className="hint">
            Vous n&apos;avez pas encore soumis de plan pour validation.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Formulaire</th>
                  <th>Session</th>
                  <th>Statut</th>
                  <th>Résumé IA</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{plan.formName}</td>
                    <td>{plan.session}</td>
                    <td>
                      <span
                        className={`status-pill ${statusClass(plan.status || "soumis")}`}
                      >
                        {statusLabels[plan.status] || "Soumis"}
                      </span>
                    </td>
                    <td>
                      <div className="summary-pills">
                        {STATUS_VALUES.map((label) => {
                          const field =
                            label === "Conforme"
                              ? "conforme"
                              : label === "À améliorer"
                              ? "ameliorer"
                              : "nonConforme";
                          return (
                            <span key={label} className="mini-pill">
                              {label}: {plan.aiSummary?.[field] ?? 0}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      <button
                        className="ghost-button"
                        onClick={() => setSelectedPlan(plan)}
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
                <p className="panel-label">Plan sélectionné</p>
                <h3>{selectedPlan.formName}</h3>
                <p className="hint">
                  Statut : {statusLabels[selectedPlan.status] || "Soumis"}
                </p>
              </div>
              <button className="ghost-button" onClick={() => setSelectedPlan(null)}>
                Fermer
              </button>
            </header>
            <div className="answer-list">
              {selectedPlan.answers?.map((answer, index) => (
                <article key={answer.questionId || index} className="answer-card">
                  <div className="answer-card-header">
                    <h4>
                      {index + 1}. {answer.prompt}
                    </h4>
                    <span
                      className={`status-pill ${statusClass(answer.aiStatus || "soumis")}`}
                    >
                      {answer.aiStatus || "N/A"}
                    </span>
                  </div>
                  <p>{answer.response}</p>
                  {answer.aiFeedback && (
                    <p className="hint">{answer.aiFeedback}</p>
                  )}
                </article>
              ))}
            </div>
            <div className="panel-actions">
              {selectedPlan.pdfUrl ? (
                <a
                  className="ghost-button"
                  href={selectedPlan.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Télécharger le PDF
                </a>
              ) : (
                <span className="hint">PDF non disponible</span>
              )}
              {selectedPlan.reviewComment && (
                <p className="hint">Commentaire : {selectedPlan.reviewComment}</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
