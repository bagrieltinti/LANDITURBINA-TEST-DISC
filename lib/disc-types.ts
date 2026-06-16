import type { Factor } from "./disc-engine";

export interface LeadData {
  nomeCompleto: string;
  telefone: string;
}

export interface DiscResultData {
  rawScores: Record<Factor, number>;
  percentages: Record<Factor, number>;
  primaryProfile: string;
  secondaryProfile: string;
  combinedString?: string;
  reportCopy?: string;
  relationships?: {
    brothers: string[];
    cousin: string;
  };
}

export interface DiscTestRecord {
  id: string;
  timestamp: string;
  leadData: LeadData;
  normalizedName: string;
  normalizedNameKey: string;
  phoneDigits: string;
  rawAnswers?: Record<string, Record<Factor, number>>;
  rawScores: Record<Factor, number>;
  percentages: Record<Factor, number>;
  primaryProfile: string;
  secondaryProfile: string;
}

export interface DiscTestInput {
  user: LeadData;
  answers: Record<string, Record<Factor, number>>;
  result: DiscResultData;
}
