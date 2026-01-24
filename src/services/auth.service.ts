import bcrypt from "bcryptjs";
import crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import mongoose from "mongoose";

import User, { IUser } from "../models/user.model";
import HttpError from "../models/error.model";
import { validatePasswordOrThrow } from "../utils/password-validator";

import { sendConfirmationEmail } from "./emailService";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./jwt.service";

const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);

// 30 días en ms (por si quieres que lo controle env, lo cambiamos luego)
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface RegisterUserDto {
  name: string;
  email: string;
  password: string;
  role?: "user" | "admin";
}

export interface LoginUserDto {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: Partial<IUser> & { id: string };
  refreshToken?: string;
}

/** Escapa caracteres especiales para uso seguro en HTML */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"'/]/g, (s) => {
    const entityMap: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "/": "&#x2F;",
    };
    return entityMap[s] || s;
  });
}

/** Hash del refresh token (NO se guarda el token plano) */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function toSafeUser(user: any) {
  // tu schema ya borra password y _id, pero aquí garantizamos id
  const obj = user?.toJSON ? user.toJSON() : user;
  return {
    ...obj,
    id: user._id?.toString?.() ?? obj?.id,
  };
}

/**
 * Registra un nuevo usuario
 * - sin organización ni rootFolder (esto se maneja en Membership)
 * - si SEND_CONFIRMATION_EMAIL=true => queda inactive hasta confirmar
 */
export async function registerUser({
  name,
  email,
  password,
  role = "user",
}: RegisterUserDto): Promise<Partial<IUser> & { id: string }> {
  const nameRegex = /^[a-zA-Z0-9\s]+$/;
  if (!name || !nameRegex.test(name.trim())) {
    throw new HttpError(400, "Name must contain only alphanumeric characters and spaces");
  }

  const emailRegex = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
    throw new HttpError(400, "Invalid email format");
  }

  validatePasswordOrThrow(password);

  const exists = await User.findOne({ email: { $eq: normalizedEmail } });
  if (exists) {
    throw new HttpError(409, "Email already registered");
  }

  const sendEmail = String(process.env.SEND_CONFIRMATION_EMAIL).toLowerCase() === "true";
  const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    role,
    organization: undefined,
    rootFolder: undefined,
    storageUsed: 0,
    active: sendEmail ? false : true,
    preferences: {
      emailNotifications: true,
      documentUpdates: true,
      aiAnalysis: true,
    },
    loginAttempts: 0,
    lockUntil: null,
    refreshTokenHash: null,
    refreshTokenExpiresAt: null,
    tokenVersion: 0,
  });

  if (sendEmail) {
    try {
      const jwt = await import("jsonwebtoken");

      const token = jwt.default.sign(
        { userId: user._id.toString() },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "1d" }
      );

      const baseUrl = process.env.CONFIRMATION_URL_BASE || `http://localhost:${process.env.PORT || 4000}`;
      const confirmationUrl = `${baseUrl}/api/auth/confirm/${token}`;

      const templatePath = path.join(process.cwd(), "src", "services", "confirmationTemplate.html");
      let html = fs.readFileSync(templatePath, "utf8");

      const safeName = escapeHtml(user.name);
      html = html.replace("{{name}}", safeName).replace("{{confirmationUrl}}", confirmationUrl);

      await sendConfirmationEmail(normalizedEmail, "Confirma tu cuenta en CloudDocs Copilot", html);
    } catch (emailErr) {
      console.error("Error enviando email de confirmación:", emailErr);
    }
  }

  return toSafeUser(user);
}

/**
 * Login:
 * - accessToken siempre
 * - rememberMe=true => refreshToken + guarda hash + exp
 */
export async function loginUser({ email, password, rememberMe }: LoginUserDto): Promise<AuthResponse> {
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    throw new HttpError(400, "Invalid credentials");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const MAX_LOGIN_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || "5", 10);
  const LOCK_MINUTES = parseInt(process.env.LOGIN_LOCK_MINUTES || "15", 10);
  const LOCK_MS = LOCK_MINUTES * 60 * 1000;

  const user = await User.findOne({ email: { $eq: normalizedEmail } });
  if (!user) throw new HttpError(404, "User not found");
  if (!user.active) throw new HttpError(403, "User account is not active");

  if (user.lockUntil && user.lockUntil.getTime() <= Date.now()) {
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();
  }

  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    const msLeft = user.lockUntil.getTime() - Date.now();
    const minutesLeft = Math.ceil(msLeft / 60000);
    throw new HttpError(423, `Account locked. Try again in ${minutesLeft} minute(s)`);
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    const attempts = (user.loginAttempts || 0) + 1;
    user.loginAttempts = attempts;

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_MS);
    }

    await user.save();

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      throw new HttpError(423, `Account locked. Try again in ${LOCK_MINUTES} minute(s)`);
    }

    const remaining = MAX_LOGIN_ATTEMPTS - attempts;
    throw new HttpError(401, `Invalid password. ${remaining} attempt(s) remaining`);
  }

  user.loginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const accessToken = signAccessToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  if (!rememberMe) {
    return { accessToken, user: toSafeUser(user) };
  }

  const refreshToken = signRefreshToken({
    id: user._id.toString(),
    tokenVersion: user.tokenVersion,
  });

  user.refreshTokenHash = hashToken(refreshToken);
  user.refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await user.save();

  return { accessToken, refreshToken, user: toSafeUser(user) };
}

/**
 * Refresh:
 * - valida refresh
 * - check hash + exp
 * - rota refresh
 * - emite access nuevo
 */
export async function refreshSession(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; user: Partial<IUser> & { id: string } }> {
  if (!refreshToken || typeof refreshToken !== "string") {
    throw new HttpError(401, "Refresh token required");
  }

  let decoded: any;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, "Invalid refresh token");
  }

  if (decoded?.type !== "refresh" || !decoded?.id) {
    throw new HttpError(401, "Invalid refresh token");
  }

  const user = await User.findById(decoded.id);
  if (!user) throw new HttpError(401, "User no longer exists");
  if (!user.active) throw new HttpError(403, "User account is not active");

  if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
    throw new HttpError(401, "Refresh token invalidated");
  }

  if (!user.refreshTokenHash || !user.refreshTokenExpiresAt) {
    throw new HttpError(401, "Refresh session not found");
  }

  if (user.refreshTokenExpiresAt.getTime() < Date.now()) {
    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    await user.save();
    throw new HttpError(401, "Refresh token expired");
  }

  const incomingHash = hashToken(refreshToken);
  if (incomingHash !== user.refreshTokenHash) {
    throw new HttpError(401, "Refresh token does not match");
  }

  const accessToken = signAccessToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  const newRefreshToken = signRefreshToken({
    id: user._id.toString(),
    tokenVersion: user.tokenVersion,
  });

  user.refreshTokenHash = hashToken(newRefreshToken);
  user.refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await user.save();

  return { accessToken, refreshToken: newRefreshToken, user: toSafeUser(user) };
}

/** Logout: revoca refresh en DB si existe token */
export async function revokeRefresh(refreshToken?: string): Promise<void> {
  if (!refreshToken) return;

  try {
    const decoded: any = verifyRefreshToken(refreshToken);
    if (!decoded?.id) return;

    const user = await User.findById(decoded.id);
    if (!user) return;

    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    await user.save();
  } catch {
    // ignore
  }
}

/** Confirma cuenta por token */
export async function confirmUserAccount(
  token: string
): Promise<{ userId: string; userName: string; userAlreadyActive: boolean }> {
  const jwt = await import("jsonwebtoken");
  const payload: any = jwt.default.verify(token, process.env.JWT_SECRET || "secret");

  if (!payload?.userId || !mongoose.Types.ObjectId.isValid(payload.userId)) {
    throw new Error("Invalid token payload");
  }

  const user = await User.findById(payload.userId);
  if (!user) throw new Error("User not found");

  if (user.active) {
    return { userId: user._id.toString(), userName: user.name, userAlreadyActive: true };
  }

  user.active = true;
  await user.save();

  return { userId: user._id.toString(), userName: user.name, userAlreadyActive: false };
}

export default {
  registerUser,
  loginUser,
  refreshSession,
  revokeRefresh,
  confirmUserAccount,
};
