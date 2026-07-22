/**
 * Shared types for TrustLayer. Kept in one file so the AI route, the
 * Solana client, and the UI never drift from the frozen interface
 * agreed at the start of the hackathon.
 */

export type RiskDecision = "low" | "medium" | "high";

export interface RiskResult {
  riskScore: number; // 0..100, higher = riskier
  decision: RiskDecision;
  /** 1-3 sentence plain-language overview of the listing risk. */
  summary: string;
  /** Concrete scoring drivers (3-6). */
  reasons: string[];
  /** What the model noticed in the text/photos. */
  observations: string[];
  /** Specific red flags or gaps a buyer should weigh. */
  concerns: string[];
  /** Practical next step for the buyer before funding. */
  buyerAdvice: string;
  imageMatch?: boolean; // only set for "compare" mode
  mocked: boolean; // true when the deterministic fallback was used instead of Gemini
}

export interface AnalyzeInitialRequest {
  mode: "initial";
  title: string;
  description: string;
  price: number;
  images: string[]; // base64 data URLs, 1-3 listing photos
}

export interface AnalyzeCompareRequest {
  mode: "compare";
  title: string;
  description: string;
  originalImages: string[];
  finalImage: string; // base64 data URL of the delivery evidence photo
}

export type AnalyzeRequest = AnalyzeInitialRequest | AnalyzeCompareRequest;

export type EscrowStatus = "created" | "funded" | "released";

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number; // in USDC, human units (e.g. 10.5)
  images: string[]; // base64 data URLs
  sellerPubkey: string;
  createdAt: number;
  initialRisk?: RiskResult;
  finalImage?: string;
  compareRisk?: RiskResult;
  escrowStatus: EscrowStatus;
  escrowId?: number; // on-chain escrow seed, set once the seller activates the escrow
  escrowAddress?: string;
  vaultAddress?: string;
  initSignature?: string;
  depositSignature?: string;
  releaseSignature?: string;
  buyerPubkey?: string;
}
