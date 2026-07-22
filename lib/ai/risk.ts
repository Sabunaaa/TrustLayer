import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import type {
  AnalyzeCompareRequest,
  AnalyzeInitialRequest,
  AnalyzeRequest,
  RiskDecision,
  RiskResult,
} from "@/lib/types";

/**
 * TrustLayer's AI is deliberately a helper, not a gate: it always returns
 * an advisory score + human-readable analysis and never blocks the escrow
 * flow itself. Callers show the result but let the buyer/seller decide.
 */

const RISK_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    riskScore: {
      type: SchemaType.NUMBER,
      description: "0 (very trustworthy) to 100 (very high risk).",
    },
    decision: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["low", "medium", "high"],
    },
    summary: {
      type: SchemaType.STRING,
      description:
        "2-4 sentence plain-language overview of overall risk, written for a non-expert buyer.",
    },
    reasons: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "3-6 concrete drivers of the score. Each reason should be a full sentence.",
    },
    observations: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "3-6 specific things noticed in the listing text and/or photos.",
    },
    concerns: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description:
        "2-5 buyer-facing concerns or evidence gaps. If nothing major stands out, say so explicitly.",
    },
    buyerAdvice: {
      type: SchemaType.STRING,
      description:
        "One practical paragraph telling the buyer what to do next before funding escrow.",
    },
    imageMatch: {
      type: SchemaType.BOOLEAN,
      description:
        "Only for image comparison: true if the final photo plausibly shows the same item as the listing photos.",
    },
  },
  required: ["riskScore", "decision", "summary", "reasons", "observations", "concerns", "buyerAdvice"],
};

const INITIAL_SYSTEM_PROMPT = `You are TrustLayer's advisory fraud-signal assistant for a peer-to-peer escrow app.
You deeply review a marketplace listing (title, description, price, photos) BEFORE any money moves and produce a
detailed advisory risk analysis. You are a helper, not a judge: you cannot verify ownership, authenticity, or
real-world delivery from images alone — say so clearly when evidence is thin.

Analyze carefully:
- Mismatches between the written description and what the photos actually show (brand, color, condition, accessories).
- Signs a photo may be stock, duplicated, watermarked, or stolen (generic studio shots, inconsistent backgrounds/lighting).
- Whether the price is plausible for the described item and condition.
- Vague, contradictory, rushed, or copy-pasted listing text.
- Missing or low-quality evidence (too few photos, blurry, cropped, cannot see serial/wear/defects).
- Visible signs of image manipulation or editing.
- What a cautious buyer should still ask or verify in person / before release.

Write for a real buyer:
- summary: 2-4 sentences, specific to THIS listing — not generic boilerplate.
- reasons: 3-6 full sentences tied to evidence you actually saw (or clearly note what is missing).
- observations: concrete visual/text details (e.g. "photo 2 shows a scratched corner not mentioned in the description").
- concerns: honest gaps and risks; if risk is low, still note residual uncertainty.
- buyerAdvice: one practical next-step paragraph.

Respond ONLY with the requested JSON. riskScore is 0-100 (higher = riskier). decision is "low" (<34), "medium"
(34-66), or "high" (>66).`;

const COMPARE_SYSTEM_PROMPT = `You are TrustLayer's advisory delivery-match assistant. The seller has uploaded a
final "proof of delivery" photo. Compare it carefully against the original listing photos and description, and
judge whether it plausibly shows the same item being delivered. You cannot prove authenticity or that delivery
physically happened — only whether the visual evidence is consistent or raises concern.

Write a detailed buyer-facing analysis:
- summary: 2-4 sentences on match confidence.
- reasons / observations / concerns: specific visual comparisons (shape, color, markings, accessories, packaging, background).
- buyerAdvice: what the buyer should do before releasing funds.
- imageMatch: true only if the final photo plausibly shows the same item.

Respond ONLY with the requested JSON. riskScore reflects mismatch risk (higher = more likely the final photo
does NOT match the original item).`;

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function decisionFromScore(score: number): RiskDecision {
  if (score >= 67) return "high";
  if (score >= 34) return "medium";
  return "low";
}

function asStringList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, max);
}

function dataUrlToInlinePart(dataUrl: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Expected a base64 image data URL");
  }
  const [, mimeType, data] = match;
  return { inlineData: { mimeType, data } };
}

/** Simple, seeded string hash so the mock fallback is deterministic per listing. */
function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function mockInitial(req: AnalyzeInitialRequest): RiskResult {
  const seed = hashString(`${req.title}|${req.description}|${req.price}|${req.images.length}`);
  let score = 20 + (seed % 30); // baseline 20-49
  const reasons: string[] = [];
  const observations: string[] = [];
  const concerns: string[] = [];

  const text = `${req.title} ${req.description}`.toLowerCase();
  const suspiciousWords = ["urgent", "wire only", "no refunds", "gift card", "western union", "final sale"];
  const hit = suspiciousWords.find((w) => text.includes(w));
  if (hit) {
    score += 25;
    reasons.push(`Listing text contains a common fraud red flag phrase ("${hit}").`);
    concerns.push(`The phrase "${hit}" often appears in pressure or non-reversible payment scams.`);
  }

  if (req.images.length === 0) {
    score += 20;
    reasons.push("No photos were provided, so there is no visual evidence to assess.");
    concerns.push("Without photos, a buyer cannot verify that the item exists or matches the title.");
  } else if (req.images.length === 1) {
    score += 8;
    reasons.push("Only one photo was provided; multiple angles would give more confidence.");
    observations.push("A single listing photo was uploaded for review.");
  } else {
    reasons.push(`${req.images.length} photos were provided, giving reasonable visual coverage.`);
    observations.push(`Reviewed ${req.images.length} listing photos alongside the written description.`);
  }

  if (req.description.trim().length < 20) {
    score += 10;
    reasons.push("The listing description is very short and lacks detail about condition or origin.");
    concerns.push("Sparse description makes it harder to spot mismatches with the photos.");
  } else {
    reasons.push("The listing description is detailed enough to cross-check against the photos.");
    observations.push("Description length is sufficient for a basic text-vs-photo consistency check.");
  }

  if (req.price <= 0) {
    score += 15;
    reasons.push("Listed price is zero or negative, which is inconsistent with a real sale.");
    concerns.push("An invalid price is a strong signal the listing is incomplete or not serious.");
  } else {
    observations.push(`Listed price is ${req.price} USDC.`);
  }

  score = clampScore(score);
  const decision = decisionFromScore(score);
  return {
    riskScore: score,
    decision,
    summary: `Mock review of "${req.title}" scored ${score}/100 (${decision}). This is a deterministic offline fallback, not a live Gemini analysis of the photos.`,
    reasons: reasons.slice(0, 6),
    observations: observations.slice(0, 6),
    concerns:
      concerns.length > 0
        ? concerns.slice(0, 5)
        : ["No major automated red flags were found in this mock pass, but residual uncertainty remains."],
    buyerAdvice:
      "Ask the seller for clearer photos, confirm condition details in chat, and only fund escrow once the listing evidence feels complete.",
    mocked: true,
  };
}

function mockCompare(req: AnalyzeCompareRequest): RiskResult {
  const seed = hashString(`${req.title}|${req.originalImages.length}|${req.finalImage.length}`);
  const bucket = seed % 100;
  const imageMatch = bucket < 78; // mostly matches, occasionally flags a mismatch for demo variety
  let score = imageMatch ? 10 + (seed % 20) : 60 + (seed % 30);
  const reasons: string[] = [];
  const observations: string[] = [];
  const concerns: string[] = [];

  if (imageMatch) {
    reasons.push("The delivery photo appears visually consistent with the original listing photos.");
    reasons.push("Framing, color, and general shape line up with what was originally listed.");
    observations.push("Compared the proof-of-delivery photo against the original listing set.");
    concerns.push("Visual consistency is advisory only and cannot prove physical handover occurred.");
  } else {
    reasons.push("The delivery photo shows notable visual differences from the original listing photos.");
    reasons.push("Consider asking the seller for an additional angle before releasing funds.");
    observations.push("Key visual attributes in the delivery photo diverge from the listing set.");
    concerns.push("Possible item mismatch — do not release funds until you get clarifying photos.");
  }
  reasons.push("Automated image comparison is advisory only and cannot fully verify authenticity.");

  score = clampScore(score);
  const decision = decisionFromScore(score);
  return {
    riskScore: score,
    decision,
    summary: imageMatch
      ? `Mock delivery check for "${req.title}" looks broadly consistent (${score}/100). This is an offline fallback, not live Gemini vision.`
      : `Mock delivery check for "${req.title}" flagged possible mismatch (${score}/100). This is an offline fallback, not live Gemini vision.`,
    reasons: reasons.slice(0, 6),
    observations: observations.slice(0, 6),
    concerns: concerns.slice(0, 5),
    buyerAdvice: imageMatch
      ? "If the item also matches what you expected in person/chat, you can proceed — still keep escrow until you are satisfied."
      : "Ask the seller for another clear photo of the same item before releasing funds.",
    imageMatch,
    mocked: true,
  };
}

/** Mock only when explicitly requested — missing keys / API errors should surface, not hide. */
function shouldUseMock(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_AI === "true" || process.env.MOCK_AI === "true";
}

function normalizeResult(
  parsed: Partial<RiskResult> & { riskScore?: number; decision?: RiskDecision },
  mode: AnalyzeRequest["mode"],
): RiskResult {
  const riskScore = clampScore(Number(parsed.riskScore));
  const decision = parsed.decision ?? decisionFromScore(riskScore);
  const reasons = asStringList(parsed.reasons, 6);
  const observations = asStringList(parsed.observations, 6);
  const concerns = asStringList(parsed.concerns, 5);
  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : `Advisory ${decision} risk signal (${riskScore}/100) based on the listing evidence provided.`;
  const buyerAdvice =
    typeof parsed.buyerAdvice === "string" && parsed.buyerAdvice.trim()
      ? parsed.buyerAdvice.trim()
      : "Review the score and notes carefully, ask clarifying questions, and only fund escrow when you are comfortable.";

  return {
    riskScore,
    decision,
    summary,
    reasons:
      reasons.length > 0
        ? reasons
        : ["The model returned a score but no detailed reasons; treat this as incomplete analysis."],
    observations:
      observations.length > 0 ? observations : ["No structured observations were returned for this pass."],
    concerns: concerns.length > 0 ? concerns : ["No specific concerns were listed; residual uncertainty still applies."],
    buyerAdvice,
    imageMatch: mode === "compare" ? Boolean(parsed.imageMatch) : undefined,
    mocked: false,
  };
}

async function callGemini(req: AnalyzeRequest): Promise<RiskResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it in Vercel env vars (or .env.local) and redeploy.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RISK_SCHEMA,
      temperature: 0.4,
    },
  });

  const parts: (string | ReturnType<typeof dataUrlToInlinePart> | { text: string })[] = [];

  if (req.mode === "initial") {
    parts.push({ text: INITIAL_SYSTEM_PROMPT });
    parts.push({
      text: `Listing title: ${req.title}\nDescription: ${req.description || "(empty)"}\nPrice (USDC): ${req.price}\nPhoto count: ${req.images.length}`,
    });
    if (req.images.length === 0) {
      parts.push({ text: "No listing photos were attached." });
    } else {
      parts.push({ text: "Listing photos follow (review each one carefully):" });
      for (const img of req.images) parts.push(dataUrlToInlinePart(img));
    }
  } else {
    parts.push({ text: COMPARE_SYSTEM_PROMPT });
    parts.push({
      text: `Listing title: ${req.title}\nDescription: ${req.description || "(empty)"}\n\nOriginal listing photos:`,
    });
    for (const img of req.originalImages) parts.push(dataUrlToInlinePart(img));
    parts.push({ text: "Final delivery / proof-of-delivery photo:" });
    parts.push(dataUrlToInlinePart(req.finalImage));
  }

  const result = await model.generateContent(parts as never);
  const text = result.response.text();
  if (!text?.trim()) {
    throw new Error("Gemini returned an empty response");
  }

  let parsed: Partial<RiskResult>;
  try {
    parsed = JSON.parse(text) as Partial<RiskResult>;
  } catch {
    throw new Error(`Gemini returned non-JSON output: ${text.slice(0, 200)}`);
  }

  return normalizeResult(parsed, req.mode);
}

export async function analyzeRisk(req: AnalyzeRequest): Promise<RiskResult> {
  if (shouldUseMock()) {
    return req.mode === "initial" ? mockInitial(req) : mockCompare(req);
  }

  return callGemini(req);
}
