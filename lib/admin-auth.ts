import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { getAdminDb } from "./firebase-admin";

const COOKIE_NAME = "landi_admin_session";
const ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";
const MIN_PASSWORD_LENGTH = 8;
const MIN_SECRET_LENGTH = 8;

type HashPayload = ReturnType<typeof hashValue>;

interface StoredAdminAccount {
  email: string;
  password: HashPayload;
  recoveryCode: HashPayload;
  createdAt: string;
  updatedAt?: string;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashValue(value: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(value, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return { salt, hash, iterations: ITERATIONS, digest: DIGEST };
}

function verifyHash(value: string, stored: HashPayload) {
  const attempt = crypto
    .pbkdf2Sync(value, stored.salt, stored.iterations || ITERATIONS, KEY_LENGTH, stored.digest || DIGEST)
    .toString("hex");
  const attemptBuffer = Buffer.from(attempt, "hex");
  const storedBuffer = Buffer.from(stored.hash, "hex");
  return attemptBuffer.length === storedBuffer.length && crypto.timingSafeEqual(attemptBuffer, storedBuffer);
}

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use uma senha com pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
}

function generateRecoveryCode() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

function encodeSessionPayload(payload: { email: string; issuedAt: number; expiresAt: number }) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeSessionPayload(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      email?: unknown;
      issuedAt?: unknown;
      expiresAt?: unknown;
    };

    if (typeof parsed.email !== "string" || typeof parsed.issuedAt !== "number" || typeof parsed.expiresAt !== "number") {
      return null;
    }

    return {
      email: normalizeEmail(parsed.email),
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

async function getSessionSecret() {
  const envSecret = process.env.ADMIN_SESSION_SECRET;
  if (envSecret) {
    if (envSecret.length < MIN_SECRET_LENGTH) {
      throw new Error(`ADMIN_SESSION_SECRET precisa ter pelo menos ${MIN_SECRET_LENGTH} caracteres.`);
    }
    return envSecret;
  }

  const ref = getAdminDb().ref("adminAuth/sessionSecret");
  const snapshot = await ref.get();
  if (snapshot.exists()) return snapshot.val() as string;

  const generated = crypto.randomBytes(32).toString("hex");
  await ref.set(generated);
  return generated;
}

async function sign(payload: string) {
  return crypto.createHmac("sha256", await getSessionSecret()).update(payload).digest("hex");
}

export async function getAdminAuthConfig(): Promise<StoredAdminAccount | null> {
  const snapshot = await getAdminDb().ref("adminAuth/account").get();
  return snapshot.exists() ? (snapshot.val() as StoredAdminAccount) : null;
}

export async function isAdminConfigured() {
  return Boolean(await getAdminAuthConfig());
}

export async function setupAdminAccount(email: string, password: string) {
  if (await isAdminConfigured()) throw new Error("Conta administrativa já configurada.");

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Informe um e-mail administrativo válido.");
  }

  validatePassword(password);

  const recoveryCode = generateRecoveryCode();
  await getAdminDb().ref("adminAuth/account").set({
    email: normalizedEmail,
    password: hashValue(password),
    recoveryCode: hashValue(recoveryCode),
    createdAt: new Date().toISOString(),
  });

  return { email: normalizedEmail, recoveryCode };
}

export async function validateAdminLogin(email: string, password: string) {
  const stored = await getAdminAuthConfig();
  if (!stored) return false;

  const normalizedEmail = normalizeEmail(email);
  return stored.email === normalizedEmail && verifyHash(password, stored.password);
}

export async function resetAdminPassword(email: string, recoveryCode: string, newPassword: string) {
  const stored = await getAdminAuthConfig();
  if (!stored) throw new Error("Conta administrativa ainda não configurada.");

  const normalizedEmail = normalizeEmail(email);
  if (stored.email !== normalizedEmail) {
    throw new Error("E-mail administrativo inválido.");
  }

  if (!verifyHash(recoveryCode.trim().toUpperCase(), stored.recoveryCode)) {
    throw new Error("Código de recuperação inválido.");
  }

  validatePassword(newPassword);

  await getAdminDb().ref("adminAuth/account").update({
    password: hashValue(newPassword),
    updatedAt: new Date().toISOString(),
  });
}

export async function createAdminSession(email: string) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 1000 * 60 * 60 * 8;
  const payload = encodeSessionPayload({ email: normalizeEmail(email), issuedAt, expiresAt });
  const value = `${payload}.${await sign(payload)}`;

  (await cookies()).set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
    path: "/",
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function isAdminSessionValid() {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return false;

  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex <= 0) return false;

  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const session = decodeSessionPayload(payload);
  if (!session) return false;

  const expected = await sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  const signatureOk =
    signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!signatureOk || session.expiresAt <= Date.now()) return false;

  const stored = await getAdminAuthConfig();
  return Boolean(stored?.email && stored.email === session.email);
}
