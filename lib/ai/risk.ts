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
 * an advisory score + human-readable reasons and never blocks the escrow
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
    reasons: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "2-4 short, concrete reasons behind the score.",
    },
    imageMatch: {
      type: SchemaType.BOOLEAN,
      description:
        "Only for image comparison: true if the final photo plausibly shows the same item as the listing photos.",
    },
  },
  required: ["riskScore", "decision", "reasons"],
};

const INITIAL_SYSTEM_PROMPT = `You are TrustLayer's advisory fraud-signal assistant for a peer-to-peer escrow app.
You review a marketplace listing (title, description, price, photos) BEFORE any money moves and produce an
advisory risk signal. You are a helper, not a judge: you cannot verify ownership, authenticity, or real-world
delivery from images alone, so stay calibrated and say so in your reasons when evidence is thin.

Look for:
- Mismatches between the written description and what the photos actually show.
- Signs a photo may be a stock/duplicate/stolen image (overly generic studio shots, watermarks, inconsistent lighting/background between photos).
- Prices that are implausible for the described item (too low for "brand new", too high for described condition).
- Vague, contradictory, or copy-pasted-sounding listing text.
- Missing or low-quality evidence (too few photos, blurry, cannot see the item clearly).
- Any visible signs of image manipulation or editing.

Respond ONLY with the requested JSON. riskScore is 0-100 (higher = riskier). decision is "low" (<34), "medium"
(34-66), or "high" (>66). Give 2-4 concise, specific reasons tied to what you actually observed.`;

const COMPARE_SYSTEM_PROMPT = `You are TrustLayer's advisory delivery-match assistant. The seller has uploaded a
final "proof of delivery" photo. Compare it against the original listing photos and description, and judge
whether it plausibly shows the same item being delivered. You cannot prove authenticity or that delivery
physically happened, only whether the visual evidence is consistent or raises concern.

Respond ONLY with the requested JSON, including imageMatch (true/false). riskScore reflects mismatch risk
(higher = more likely the final photo does NOT match the original item). Give 2-4 concise, specific reasons.`;

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function decisionFromScore(score: number): RiskDecision {
  if (score >= 67) return "high";
  if (score >= 34) return "medium";
  return "low";
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

  const text = `${req.title} ${req.description}`.toLowerCase();
  const suspiciousWords = ["urgent", "wire only", "no refunds", "gift card", "western union", "final sale"];
  const hit = suspiciousWords.find((w) => text.includes(w));
  if (hit) {
    score += 25;
    reasons.push(`Listing text contains a common fraud red flag phrase ("${hit}").`);
  }

  if (req.images.length === 0) {
    score += 20;
    reasons.push("No photos were provided, so there is no visual evidence to assess.");
  } else if (req.images.length === 1) {
    score += 8;
    reasons.push("Only one photo was provided; multiple angles would give more confidence.");
  } else {
    reasons.push(`${req.images.length} photos were provided, giving reasonable visual coverage.`);
  }

  if (req.description.trim().length < 20) {
    score += 10;
    reasons.push("The listing description is very short and lacks detail about condition or origin.");
  } else {
    reasons.push("The listing description is detailed enough to cross-check against the photos.");
  }

  if (req.price <= 0) {
    score += 15;
    reasons.push("Listed price is zero or negative, which is inconsistent with a real sale.");
  }

  score = clampScore(score);
  return {
    riskScore: score,
    decision: decisionFromScore(score),
    reasons: reasons.slice(0, 4),
    mocked: true,
  };
}

function mockCompare(req: AnalyzeCompareRequest): RiskResult {
  const seed = hashString(`${req.title}|${req.originalImages.length}|${req.finalImage.length}`);
  const bucket = seed % 100;
  const imageMatch = bucket < 78; // mostly matches, occasionally flags a mismatch for demo variety
  let score = imageMatch ? 10 + (seed % 20) : 60 + (seed % 30);
  const reasons: string[] = [];

  if (imageMatch) {
    reasons.push("The delivery photo appears visually consistent with the original listing photos.");
    reasons.push("Framing, color, and general shape line up with what was originally listed.");
  } else {
    reasons.push("The delivery photo shows notable visual differences from the original listing photos.");
    reasons.push("Consider asking the seller for an additional angle before releasing funds.");
  }
  reasons.push("Automated image comparison is advisory only and cannot fully verify authenticity.");

  score = clampScore(score);
  return {
    riskScore: score,
    decision: decisionFromScore(score),
    reasons: reasons.slice(0, 4),
    imageMatch,
    mocked: true,
  };
}

function shouldUseMock(): boolean {
  if (process.env.NEXT_PUBLIC_MOCK_AI === "true" || process.env.MOCK_AI === "true") return true;
  return !process.env.GEMINI_API_KEY;
}

async function callGemini(req: AnalyzeRequest): Promise<RiskResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RISK_SCHEMA,
    },
  });

  const parts: (string | ReturnType<typeof dataUrlToInlinePart> | { text: string })[] = [];

  if (req.mode === "initial") {
    parts.push({ text: INITIAL_SYSTEM_PROMPT });
    parts.push({
      text: `Listing title: ${req.title}\nDescription: ${req.description}\nPrice (USDC): ${req.price}`,
    });
    for (const img of req.images) parts.push(dataUrlToInlinePart(img));
  } else {
    parts.push({ text: COMPARE_SYSTEM_PROMPT });
    parts.push({ text: `Listing title: ${req.title}\nDescription: ${req.description}\n\nOriginal listing photos:` });
    for (const img of req.originalImages) parts.push(dataUrlToInlinePart(img));
    parts.push({ text: "Final delivery / proof-of-delivery photo:" });
    parts.push(dataUrlToInlinePart(req.finalImage));
  }

  const result = await model.generateContent(parts as never);
  const text = result.response.text();
  const parsed = JSON.parse(text) as {
    riskScore: number;
    decision: RiskDecision;
    reasons: string[];
    imageMatch?: boolean;
  };

  const riskScore = clampScore(parsed.riskScore);
  return {
    riskScore,
    decision: parsed.decision ?? decisionFromScore(riskScore),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 4) : [],
    imageMatch: req.mode === "compare" ? Boolean(parsed.imageMatch) : undefined,
    mocked: false,
  };
}

export async function analyzeRisk(req: AnalyzeRequest): Promise<RiskResult> {
  if (shouldUseMock()) {
    return req.mode === "initial" ? mockInitial(req) : mockCompare(req);
  }

  try {
    return await callGemini(req);
  } catch (err) {
    console.error("Gemini analysis failed, falling back to deterministic mock:", err);
    return req.mode === "initial" ? mockInitial(req) : mockCompare(req);
  }
}
