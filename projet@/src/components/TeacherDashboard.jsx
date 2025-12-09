import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firestore, storage } from "../firebase";
import {
  analyzeAnswerWithOpenAi,
  isOpenAiConfigured,
  runFallbackAnalysis,
} from "../services/openAiValidator";

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

const STATUS_VALUES = ["Conforme", "A ameliorer", "Non conforme"];

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
  pdf += `trailer << /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
};

const sanitizeFilename = (value) =>
  value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");

const ensureQuestionIds = (questions) =>
  (questions || []).map((question, index) => ({
    id: question.id || `q_${index}_${Math.random().toString(36).slice(2, 8)}`,
    text: question.text || "",
    rule: question.rule || "",
  }));

export default function TeacherDashboard({ user }) {
  const [availableForms, setAvailableForms] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState(null);
  const [answersByForm, setAnswersByForm] = useState({});
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [analysisErrorsByForm, setAnalysisErrorsByForm] = useState({});
  const openAiReady = isOpenAiConfigured();

  const activeForm = useMemo(() => {
    if (!selectedFormId) return null;
    return availableForms.find((form) => form.id === selectedFormId) || null;
  }, [availableForms, selectedFormId]);

  const answersForSelected = useMemo(
    () => answersByForm[selectedFormId] || {},
    [answersByForm, selectedFormId]
  );

  const analysisErrorsForSelected = useMemo(
    () => analysisErrorsByForm[selectedFormId] || {},
    [analysisErrorsByForm, selectedFormId]
  );

  // Active forms list and selection
  useEffect(() => {
    const q = query(
      collection(firestore, "forms"),
      where("isActive", "==", true)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const nextForms = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const questions = ensureQuestionIds(data.questions);
        return { id: docSnap.id, ...data, questions };
      });
      setAvailableForms(nextForms);
      setSelectedFormId((current) => {
        if (current && nextForms.some((form) => form.id === current))
          return current;
        return nextForms[0]?.id || null;
      });
    });
    return () => unsub();
  }, []);

  // Teacher plans
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
      const entry = answersForSelected[question.id];
      return entry?.response?.trim();
    }).length;
    return Math.round((answered / activeForm.questions.length) * 100);
  }, [activeForm, answersForSelected]);

  const handleAnswerChange = (questionId, value) => {
    if (!selectedFormId) return;
    setAnswersByForm((prev) => {
      const current = prev[selectedFormId] || {};
      return {
        ...prev,
        [selectedFormId]: {
          ...current,
          [questionId]: {
            ...current[questionId],
            response: value,
          },
        },
      };
    });
    setAnalysisErrorsByForm((prev) => {
      const current = prev[selectedFormId] || {};
      if (!current[questionId]) return prev;
      const next = { ...current };
      delete next[questionId];
      return { ...prev, [selectedFormId]: next };
    });
  };

  const handleAnalyzeQuestion = async (question) => {
    const entry = answersForSelected[question.id];
    if (!entry?.response?.trim()) {
      setMessage("Veuillez ecrire votre reponse avant d'analyser.");
      return;
    }
    setAnalyzingId(question.id);
    try {
      const evaluation = openAiReady
        ? await analyzeAnswerWithOpenAi({
            question: question.text,
            rule: question.rule,
            response: entry.response,
          })
        : runFallbackAnalysis(entry.response, question.rule);
      setAnswersByForm((prev) => {
        const current = prev[selectedFormId] || {};
        return {
          ...prev,
          [selectedFormId]: {
            ...current,
            [question.id]: {
              ...entry,
              ...evaluation,
            },
          },
        };
      });
      setAnalysisErrorsByForm((prev) => ({
        ...prev,
        [selectedFormId]: {
          ...(prev[selectedFormId] || {}),
          [question.id]: null,
        },
      }));
      if (!openAiReady) {
        setMessage(
          "Analyse simplifiee appliquee (ajoutez VITE_OPENAI_API_KEY pour ChatGPT)."
        );
      }
    } catch (error) {
      console.error("handleAnalyzeQuestion", error);
      const fallback = runFallbackAnalysis(entry.response, question.rule);
      setAnswersByForm((prev) => {
        const current = prev[selectedFormId] || {};
        return {
          ...prev,
          [selectedFormId]: {
            ...current,
            [question.id]: {
              ...entry,
              ...fallback,
            },
          },
        };
      });
      setAnalysisErrorsByForm((prev) => ({
        ...prev,
        [selectedFormId]: {
          ...(prev[selectedFormId] || {}),
          [question.id]: error.message,
        },
      }));
      setMessage("Analyse IA indisponible. Verifiez la cle ou reessayez.");
    } finally {
      setAnalyzingId(null);
    }
  };

  const buildPlanLines = (answersPayload) => {
    const lines = [
      `Plan : ${activeForm?.name || "Sans nom"}`,
      `Enseignant : ${user?.displayName || user?.email}`,
      `Session : ${activeForm?.session || "N/D"}`,
      `Date : ${new Date().toLocaleString("fr-CA")}`,
      "",
    ];
    answersPayload.forEach((answer, index) => {
      lines.push(`${index + 1}. ${answer.prompt}`);
      lines.push(`Reponse : ${answer.response}`);
      lines.push(
        `Validation : ${answer.aiStatus} - ${answer.aiFeedback || "N/A"}`
      );
      if (answer.aiEngine) {
        lines.push(
          `IA : ${answer.aiEngine}${
            answer.aiModel ? ` (${answer.aiModel})` : ""
          }`
        );
      }
      if (answer.aiHighlights?.length) {
        lines.push(`Points cles : ${answer.aiHighlights.join(", ")}`);
      }
      lines.push("");
    });
    return lines;
  };

  const handleSubmitPlan = async () => {
    if (!activeForm || !activeForm.questions?.length || !selectedFormId) {
      setMessage("Aucun formulaire actif n'est disponible ou selectionne.");
      return;
    }
    if (activeForm.questions.length < 10) {
      setMessage("Le formulaire actif doit contenir au moins 10 questions.");
      return;
    }

    const missing = activeForm.questions.find(
      (question) => !answersForSelected[question.id]?.response?.trim()
    );
    if (missing) {
      setMessage("Veuillez repondre a toutes les questions du formulaire.");
      return;
    }

    setSaving(true);
    try {
      const answersPayload = [];
      for (const question of activeForm.questions) {
        const entry = answersForSelected[question.id] || {};
        const response = entry.response?.trim() || "";
        let evaluation = entry.aiStatus && entry.aiFeedback ? entry : null;
        if (!evaluation || (openAiReady && entry.aiEngine !== "chatgpt")) {
          try {
            evaluation = openAiReady
              ? await analyzeAnswerWithOpenAi({
                  question: question.text,
                  rule: question.rule,
                  response,
                })
              : runFallbackAnalysis(response, question.rule);
          } catch (error) {
            console.error("analyse lors de la soumission", error);
            evaluation = runFallbackAnalysis(response, question.rule);
          }
        }
        answersPayload.push({
          questionId: question.id,
          prompt: question.text,
          rule: question.rule,
          response,
          aiStatus: evaluation.aiStatus,
          aiFeedback: evaluation.aiFeedback,
          aiHighlights: evaluation.aiHighlights || [],
          aiEngine: evaluation.aiEngine,
          aiModel: evaluation.aiModel,
        });
      }

      const summary = answersPayload.reduce(
        (accumulator, answer) => {
          if (answer.aiStatus === "Conforme") accumulator.conforme += 1;
          if (answer.aiStatus === "A ameliorer") accumulator.ameliorer += 1;
          if (answer.aiStatus === "Non conforme") accumulator.nonConforme += 1;
          return accumulator;
        },
        { conforme: 0, ameliorer: 0, nonConforme: 0 }
      );

      const lines = buildPlanLines(answersPayload);
      const pdfBlob = createPdfBlob(lines);
      const teacherName = sanitizeFilename(
        user.displayName || user.email || "enseignant"
      );
      const formName = sanitizeFilename(activeForm.name || "plan");
      const timestamp = Date.now();
      const fileRef = ref(
        storage,
        `plans/${user.uid}/${teacherName}_${formName}_${timestamp}.pdf`
      );
      await uploadBytes(fileRef, pdfBlob, { contentType: "application/pdf" });
      const pdfUrl = await getDownloadURL(fileRef);

      const firestorePayload = {
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
      };

      const docRef = await addDoc(
        collection(firestore, "coursePlans"),
        firestorePayload
      );

      // Optimistic UI update so the history reflects the new submission immediately
      const optimisticPlan = {
        id: docRef.id,
        ...firestorePayload,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setPlans((prev) => [
        optimisticPlan,
        ...prev.filter((plan) => plan.id !== docRef.id),
      ]);
      setAnswersByForm((prev) => ({
        ...prev,
        [selectedFormId]: {},
      }));
      setAnalysisErrorsByForm((prev) => ({
        ...prev,
        [selectedFormId]: {},
      }));
      setMessage(
        "Plan envoye pour validation. Vous recevrez un retour bientot."
      );
    } catch (error) {
      console.error("handleSubmitPlan", error);
      setMessage("Impossible de soumettre le plan, reessayez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="panel-label">Formulaire selectionne</p>
            <h2>{activeForm?.name || "Aucun formulaire publie"}</h2>
            <p className="hint">
              Session : {activeForm?.session || "Non definie"} - Progression :{" "}
              {progress}%
            </p>
          </div>
          {availableForms.length > 0 && (
            <label className="select-field">
              <span className="hint">Choisir un formulaire actif</span>
              <select
                value={selectedFormId || ""}
                onChange={(event) =>
                  setSelectedFormId(event.target.value || null)
                }
              >
                {availableForms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.name} {form.session ? `(${form.session})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="primary-button"
            onClick={handleSubmitPlan}
            disabled={!activeForm || saving}
          >
            {saving ? "Soumission..." : "Soumettre le plan"}
          </button>
        </header>

        {!openAiReady && (
          <div className="hint">
            Ajoutez <code>VITE_OPENAI_API_KEY</code> dans{" "}
            <code>.env.local</code> pour activer l'analyse ChatGPT. Un mode
            heuristique est utilise en attendant.
          </div>
        )}

        {!activeForm ? (
          <p className="hint">
            Aucun formulaire n'est disponible pour le moment. Revenez plus tard.
          </p>
        ) : (
          <div className="question-answer-list">
            {activeForm.questions.map((question) => {
              const entry = answersForSelected[question.id] || {};
              return (
                <article key={question.id} className="answer-card">
                  <div className="answer-card-header">
                    <div>
                      <h4>{question.text}</h4>
                      {question.rule && (
                        <p className="hint">Regle IA : {question.rule}</p>
                      )}
                    </div>
                    {entry.aiStatus && (
                      <span
                        className={`status-pill ${statusClass(entry.aiStatus)}`}
                      >
                        {entry.aiStatus}
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Saisissez votre reponse"
                    value={entry.response || ""}
                    onChange={(event) =>
                      handleAnswerChange(question.id, event.target.value)
                    }
                  />
                  <div className="panel-actions">
                    {entry.aiFeedback && (
                      <p className="hint">{entry.aiFeedback}</p>
                    )}
                    {entry.aiHighlights?.length > 0 && (
                      <p className="hint">
                        Points cles : {entry.aiHighlights.join(", ")}
                      </p>
                    )}
                    {analysisErrorsForSelected[question.id] && (
                      <p className="hint" style={{ color: "#fca5a5" }}>
                        {analysisErrorsForSelected[question.id]}
                      </p>
                    )}
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => handleAnalyzeQuestion(question)}
                      disabled={analyzingId === question.id}
                    >
                      {analyzingId === question.id
                        ? "Analyse en cours..."
                        : "Analyser la reponse"}
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
            Vous n'avez pas encore soumis de plan pour validation.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Formulaire</th>
                  <th>Session</th>
                  <th>Statut</th>
                  <th>Resume IA</th>
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
                        className={`status-pill ${statusClass(
                          plan.status || "soumis"
                        )}`}
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
                              : label === "A ameliorer"
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
                <p className="panel-label">Plan selectionne</p>
                <h3>{selectedPlan.formName}</h3>
                <p className="hint">
                  Statut : {statusLabels[selectedPlan.status] || "Soumis"}
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
                  Telecharger le PDF
                </a>
              ) : (
                <span className="hint">PDF non disponible</span>
              )}
              {selectedPlan.reviewComment && (
                <p className="hint">
                  Commentaire : {selectedPlan.reviewComment}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
