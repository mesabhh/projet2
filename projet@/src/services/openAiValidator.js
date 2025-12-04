const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const FALLBACK_MODEL = "Heuristique locale";
const DEFAULT_MODEL = "gpt-4o-mini";

const baseSystemPrompt =
  "Tu es un coordonnateur pedagogique. Verifie si une reponse respecte la question et la regle de validation fournie. Retourne uniquement un JSON avec les cles: aiStatus (Conforme, A ameliorer, Non conforme), aiFeedback (francais, 2 phrases max), aiHighlights (liste courte d'elements requis).";

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
  if (!status) return "A ameliorer";
  const lower = status.toString().toLowerCase();
  if (lower.includes("non")) return "Non conforme";
  if (lower.includes("conforme")) return "Conforme";
  return "A ameliorer";
};

export const isOpenAiConfigured = () => Boolean(import.meta.env.VITE_OPENAI_API_KEY);

export async function analyzeAnswerWithOpenAi({
  question,
  rule,
  response,
  model = DEFAULT_MODEL,
}) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Aucune cle OpenAI detectee. Ajoutez VITE_OPENAI_API_KEY dans .env.local.");
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
            text: `Question: ${question}\nRegle IA: ${rule || "Non specifiee"}\nReponse de l'enseignant:\n${response}`,
          },
          {
            type: "text",
            text: "Retourne uniquement le JSON demande, sans commentaire additionnel.",
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
    throw new Error(`Erreur OpenAI (${request.status}): ${errorText.slice(0, 200)}`);
  }

  const completion = await request.json();
  const content =
    completion?.choices?.[0]?.message?.content ||
    completion?.choices?.[0]?.message?.content?.[0]?.text ||
    "";

  const parsed = parseJsonContent(content);
  if (!parsed) {
    throw new Error("Reponse IA invalide (format JSON introuvable).");
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
      aiFeedback: "La reponse est vide.",
      aiHighlights: [],
      aiEngine: "heuristique",
      aiModel: FALLBACK_MODEL,
    };
  }
  if (clean.length < 80) {
    return {
      aiStatus: "A ameliorer",
      aiFeedback: "Ajoutez davantage de details (80 caracteres minimum).",
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
        aiStatus: "A ameliorer",
        aiFeedback: `Mentionnez l'element suivant : "${missing}".`,
        aiHighlights: [missing],
        aiEngine: "heuristique",
        aiModel: FALLBACK_MODEL,
      };
    }
  }
  if (clean.length < 150) {
    return {
      aiStatus: "A ameliorer",
      aiFeedback: "Structurez la reponse avec objectifs, activites et evaluation.",
      aiHighlights: [],
      aiEngine: "heuristique",
      aiModel: FALLBACK_MODEL,
    };
  }
  return {
    aiStatus: "Conforme",
    aiFeedback: "Reponse coherente et suffisamment detaillee.",
    aiHighlights: [],
    aiEngine: "heuristique",
    aiModel: FALLBACK_MODEL,
  };
}
