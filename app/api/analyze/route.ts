import { NextRequest, NextResponse } from "next/server";
import { analyzeRisk } from "@/lib/ai/risk";
import type { AnalyzeRequest } from "@/lib/types";

export const runtime = "nodejs";

function isValidRequest(body: unknown): body is AnalyzeRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.mode === "initial") {
    return (
      typeof b.title === "string" &&
      typeof b.description === "string" &&
      typeof b.price === "number" &&
      Array.isArray(b.images)
    );
  }
  if (b.mode === "compare") {
    return (
      typeof b.title === "string" &&
      typeof b.description === "string" &&
      Array.isArray(b.originalImages) &&
      typeof b.finalImage === "string"
    );
  }
  return false;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidRequest(body)) {
    return NextResponse.json(
      { error: 'Body must be { mode: "initial", title, description, price, images } or { mode: "compare", title, description, originalImages, finalImage }' },
      { status: 400 },
    );
  }

  try {
    const result = await analyzeRisk(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("/api/analyze failed:", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
