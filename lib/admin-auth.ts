import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { getAdminDb } from "./firebase-admin";

const COOKIE_NAME = "landi_admin_session";
const ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET precisa ter pelo menos 32 caracteres.");
  }
  return secret;
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return { salt, hash, iterations: ITERATIONS, digest: DIGEST };
}

function verifyPassword(password: string, stored: any) {
  const attempt = crypto
    .pbkdf2Sync(password, stored.salt, stored.iterations || ITERATIONS, KEY_LENGTH, stored.digest || DIGEST)
    .toString("hex");
  const attemptBuffer = Buffer.from(attempt, "hex");
  const storedBuffer = Buffer.from(stored.hash, "hex");
  return attemptBuffer.length === storedBuffer.length && crypto.timingSafeEqual(attemptBuffer, storedBuffer);
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export async function getAdminAuthConfig() {
  const snapshot = await getAdminDb().ref("adminAuth/password").get();
  return snapshot.exists() ? snapshot.val() : null;
}

export async function isAdminConfigured() {
  return Boolean(await getAdminAuthConfig());
}

export async function setupAdminPassword(password: string) {
  if (await isAdminConfigured()) throw new Error("Senha administrativa ja configurada.");
  if (password.length < 10) throw new Error("Use uma senha com pelo menos 10 caracteres.");

  await getAdminDb().ref("adminAuth/password").set({
    ...hashPassword(password),
    createdAt: new Date().toISOString(),
  });
}

export async function validateAdminPassword(password: string) {
  const stored = await getAdminAuthConfig();
  if (!stored) return false;
  return verifyPassword(password, stored);
}

export async function createAdminSession() {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 1000 * 60 * 60 * 8;
  const payload = `${issuedAt}.${expiresAt}`;
  const value = `${payload}.${sign(payload)}`;

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

  const parts = value.split(".");
  if (parts.length !== 3) return false;

  const [issuedAt, expiresAt, signature] = parts;
  const payload = `${issuedAt}.${expiresAt}`;
  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  const signatureOk =
    signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  return signatureOk && Number(expiresAt) > Date.now();
}
