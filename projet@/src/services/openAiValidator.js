const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const FALLBACK_MODEL = "Heuristique locale";
const DEFAULT_MODEL = "gpt-4o-mini";

const baseSystemPrompt =
  "Tu es un coordonnateur pédagogique. Tu dois vérifier si une réponse respecte la question et la règle de validation fournie. Retourne exclusivement un objet JSON avec les clés: aiStatus (valeurs: Conforme, À améliorer, Non conforme), aiFeedback (texte en français, 2 phrases max), aiHighlights (liste courte d'éléments requis).";

const parseJsonContent = (raw) => {
  if (!raw) return null;
  try {
    const cleaned = raw.trim().replace(/```json|```/g, "");
    return JSON.parse(cleaned);
  } catch (error) {
    return null;
  }
};

const normalizeStatus = (status) => {
  if (!status) return "À améliorer";
  const lower = status.toString().toLowerCase();
  if (lower.includes("non")) return "Non conforme";
  if (lower.includes("conforme")) return "Conforme";
  return "À améliorer";
};

export const isOpenAiConfigured = () => {
  return Boolean(import.meta.env.VITE_OPENAI_API_KEY);
};

export async function analyzeAnswerWithOpenAi({
  question,
  rule,
  response,
  model = DEFAULT_MODEL,
}) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Aucune clé OpenAI détectée. Ajoutez VITE_OPENAI_API_KEY dans .env.local."
    );
  }

  const payload = {
    model,
    temperature: 0.2,
    max_tokens: 350,
    messages: [
      { role: "system", content: baseSystemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Question: ${question}\nRègle IA: ${rule || "Non spécifiée"}\nRéponse de l'enseignant:\n${response}`,
          },
          {
            type: "text",
            text: "Retourne uniquement le JSON demandé, sans commentaire additionnel.",
          },
        ],
      },
    ],
  };

  const request = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!request.ok) {
    const errorText = await request.text();
    throw new Error(
      `Erreur OpenAI (${request.status}): ${errorText.slice(0, 200)}`
    );
  }

  const completion = await request.json();
  const content =
    completion?.choices?.[0]?.message?.content ||
    completion?.choices?.[0]?.message?.content[0]?.text ||
    "";

  const parsed = parseJsonContent(content);
  if (!parsed) {
    throw new Error("Réponse IA invalide (format JSON introuvable).");
  }

  return {
    aiStatus: normalizeStatus(parsed.aiStatus || parsed.status),
    aiFeedback: parsed.aiFeedback || parsed.feedback || "Analyse fournie.",
    aiHighlights: parsed.aiHighlights || parsed.highlights || [],
    aiEngine: "chatgpt",
    aiModel: completion?.model || model,
    usage: completion?.usage || {},
    raw: parsed,
  };
}

export function runFallbackAnalysis(response, rule) {
  const clean = response.trim();
  if (!clean) {
    return {
      aiStatus: "Non conforme",
      aiFeedback: "La réponse est vide.",
      aiHighlights: [],
      aiEngine: "heuristique",
      aiModel: FALLBACK_MODEL,
    };
  }
  if (clean.length < 80) {
    return {
      aiStatus: "À améliorer",
      aiFeedback: "Ajoutez davantage de détails (80 caractères minimum).",
      aiHighlights: [],
      aiEngine: "heuristique",
      aiModel: FALLBACK_MODEL,
    };
  }
  if (rule) {
    const keywords = rule.toLowerCase().split(/\s+/).slice(0, 2);
    const missing = keywords.find(
      (kw) => kw.length > 3 && !clean.toLowerCase().includes(kw)
    );
    if (missing) {
      return {
        aiStatus: "À améliorer",
        aiFeedback: `Mentionnez l'élément suivant : "${missing}".`,
        aiHighlights: [missing],
        aiEngine: "heuristique",
        aiModel: FALLBACK_MODEL,
      };
    }
  }
  if (clean.length < 150) {
    return {
      aiStatus: "À améliorer",
      aiFeedback:
        "Structurez la réponse avec objectifs, activités et évaluation.",
      aiHighlights: [],
      aiEngine: "heuristique",
      aiModel: FALLBACK_MODEL,
    };
  }
  return {
    aiStatus: "Conforme",
    aiFeedback: "Réponse cohérente et suffisamment détaillée.",
    aiHighlights: [],
    aiEngine: "heuristique",
    aiModel: FALLBACK_MODEL,
  };
}
