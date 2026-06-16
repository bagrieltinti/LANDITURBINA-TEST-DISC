import "server-only";

import { getAdminDb } from "./firebase-admin";
import type { DiscTestInput, DiscTestRecord, LeadData } from "./disc-types";
import { normalizeName, normalizeNameKey, onlyDigits } from "./normalization";

type LegacyUserBucket = Record<string, { tests?: Record<string, unknown> }>;

function buildRecord(id: string, value: any): DiscTestRecord | null {
  const leadData = value.leadData || value.user || {};
  const nomeCompleto = normalizeName(leadData.nomeCompleto || [leadData.nome, leadData.sobrenome].filter(Boolean).join(" "));
  const telefone = leadData.telefone || "";
  const phoneDigits = onlyDigits(value.phoneDigits || telefone);
  const percentages = value.percentages;

  if (!nomeCompleto || !percentages) return null;

  return {
    id,
    timestamp: value.timestamp || new Date(0).toISOString(),
    leadData: {
      nomeCompleto,
      telefone,
    },
    normalizedName: value.normalizedName || nomeCompleto,
    normalizedNameKey: value.normalizedNameKey || normalizeNameKey(nomeCompleto),
    phoneDigits,
    rawAnswers: value.rawAnswers,
    rawScores: value.rawScores || { D: 0, I: 0, S: 0, C: 0 },
    percentages,
    primaryProfile: value.primaryProfile || "",
    secondaryProfile: value.secondaryProfile || "",
  };
}

function sortNewest(tests: DiscTestRecord[]) {
  return tests.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

async function getModernTests() {
  try {
    const snapshot = await getAdminDb().ref("discTests").get();
    const data = snapshot.exists() ? snapshot.val() : {};
    return Object.entries(data)
      .map(([id, value]) => buildRecord(id, value))
      .filter(Boolean) as DiscTestRecord[];
  } catch (error) {
    console.warn("Não foi possível ler discTests; usando users/{telefone}/tests.", error);
    return [];
  }
}

async function getLegacyTests() {
  try {
    const snapshot = await getAdminDb().ref("users").get();
    const users = (snapshot.exists() ? snapshot.val() : {}) as LegacyUserBucket;
    const tests: DiscTestRecord[] = [];

    Object.entries(users).forEach(([phoneDigits, user]) => {
      Object.entries(user.tests || {}).forEach(([testId, value]) => {
        const record = buildRecord(`${phoneDigits}_${testId}`, { ...(value as object), phoneDigits });
        if (record) tests.push(record);
      });
    });

    return tests;
  } catch (error) {
    console.error("Não foi possível ler users/{telefone}/tests.", error);
    return [];
  }
}

export async function listAllTests() {
  const [modern, legacy] = await Promise.all([getModernTests(), getLegacyTests()]);
  const byId = new Map<string, DiscTestRecord>();
  [...modern, ...legacy].forEach((test) => byId.set(test.id, test));
  return sortNewest([...byId.values()]);
}

export async function findTestsByLead(user: LeadData) {
  const nameKey = normalizeNameKey(user.nomeCompleto);
  const phoneDigits = onlyDigits(user.telefone);
  const tests = await listAllTests();

  return tests.filter((test) => {
    const samePhone = phoneDigits && test.phoneDigits === phoneDigits;
    const sameName = nameKey && test.normalizedNameKey === nameKey;
    return Boolean(samePhone || sameName);
  });
}

export async function saveDiscTest(input: DiscTestInput) {
  const db = getAdminDb();
  const phoneDigits = onlyDigits(input.user.telefone);
  const normalizedName = normalizeName(input.user.nomeCompleto);
  const normalizedNameKey = normalizeNameKey(input.user.nomeCompleto);

  if (!phoneDigits || !normalizedNameKey) {
    throw new Error("Nome completo e telefone são obrigatórios.");
  }

  const now = new Date().toISOString();
  const ref = db.ref(`users/${phoneDigits}/tests`).push();
  const testId = ref.key;

  if (!testId) throw new Error("Não foi possível gerar o ID do teste.");

  const record = {
    timestamp: now,
    leadData: {
      nomeCompleto: normalizedName,
      telefone: input.user.telefone,
    },
    rawAnswers: input.answers,
    rawScores: input.result.rawScores,
    percentages: input.result.percentages,
    primaryProfile: input.result.primaryProfile,
    secondaryProfile: input.result.secondaryProfile,
  };

  await ref.set(record);
  try {
    await db.ref(`users/${phoneDigits}/profile`).update({
      nomeCompleto: normalizedName,
      normalizedName,
      normalizedNameKey,
      phoneDigits,
      telefone: input.user.telefone,
      lastTestAt: now,
    });
  } catch (error) {
    console.warn("Teste salvo, mas não foi possível atualizar o perfil resumido.", error);
  }

  return buildRecord(`${phoneDigits}_${testId}`, { ...record, phoneDigits });
}
