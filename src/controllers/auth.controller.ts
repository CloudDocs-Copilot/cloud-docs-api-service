import { Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import {
  registerUser,
  loginUser,
  refreshSession,
  revokeRefresh,
  confirmUserAccount,
} from "../services/auth.service";
import HttpError from "../models/error.model";

function cookieBaseOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? ("strict" as const) : ("lax" as const),
    path: "/",
  };
}

const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000; // 15m
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30d

export async function register(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password } = req.body;

    // ✅ Registro simple (sin organizationId)
    if (!name || !email || !password) {
      return next(new HttpError(400, "Missing required fields (name, email, password)"));
    }

    const user = await registerUser({ name, email, password });
    res.status(201).json({ message: "User registered successfully", user });
  } catch (err: any) {
    // Mongo duplicate key
    if (err?.message && String(err.message).includes("duplicate key")) {
      return next(new HttpError(409, "Email already registered"));
    }
    next(err);
  }
}

export async function login(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return next(new HttpError(400, "Missing required fields"));
    }

    const result = await loginUser({ email, password, rememberMe });

    // Access cookie: 15 min
    res.cookie("token", result.accessToken, {
      ...cookieBaseOptions(),
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });

    // Refresh cookie: 30 días SOLO si rememberMe
    if (rememberMe && result.refreshToken) {
      res.cookie("refreshToken", result.refreshToken, {
        ...cookieBaseOptions(),
        maxAge: REFRESH_COOKIE_MAX_AGE,
      });
    } else {
      // si no pidió rememberMe, limpia refresh anterior si existiera
      res.clearCookie("refreshToken", { ...cookieBaseOptions() });
    }

    res.json({ message: "Login successful", user: result.user });
  } catch (err: any) {
    if (err instanceof HttpError) return next(err);

    // fallback defensivo
    if (err?.message) {
      if (err.message === "User not found") return next(new HttpError(404, "Usuario no existe"));
      if (err.message === "Invalid password") return next(new HttpError(401, "Contraseña incorrecta"));
      if (err.message === "User account is not active") return next(new HttpError(403, "Cuenta desactivada"));

      if (typeof err.message === "string" && err.message.startsWith("Account locked")) {
        return next(new HttpError(423, err.message));
      }
    }

    return next(new HttpError(500, "Internal server error"));
  }
}

/**
 * POST /api/auth/refresh
 * Requiere cookie refreshToken
 * Devuelve user y setea nuevas cookies (access + refresh rotado)
 */
export async function refresh(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return next(new HttpError(401, "Refresh token required"));
    }

    const result = await refreshSession(refreshToken);

    // nuevo access 15m
    res.cookie("token", result.accessToken, {
      ...cookieBaseOptions(),
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });

    // refresh rotado 30d
    res.cookie("refreshToken", result.refreshToken, {
      ...cookieBaseOptions(),
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });

    res.json({ message: "Session refreshed", user: result.user });
  } catch (err: any) {
    next(err);
  }
}

/**
 * Logout: limpia cookies y revoca refresh si existe
 * (NO necesita authMiddleware)
 */
export async function logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken;

    // revoca refresh en DB si existe
    await revokeRefresh(refreshToken);

    // limpia cookies
    res.clearCookie("token", { ...cookieBaseOptions() });
    res.clearCookie("refreshToken", { ...cookieBaseOptions() });

    res.json({ message: "Logout successful" });
  } catch (err: any) {
    next(err);
  }
}

/**
 * GET /api/auth/confirm/:token
 * Confirma cuenta por token
 */
export async function confirmAccount(req: any, res: Response, next: NextFunction) {
  try {
    const { token } = req.params;
    if (!token) return next(new HttpError(400, "Token is required"));

    try {
      const result = await confirmUserAccount(token);

      if (result.userAlreadyActive) {
        return res.json({ success: true, message: "Account already confirmed" });
      }

      return res.json({ success: true, message: "Account confirmed successfully" });
    } catch (err: any) {
      return next(new HttpError(400, err?.message || "Invalid or expired token"));
    }
  } catch (err) {
    next(err);
  }
}

export default { register, login, refresh, logout, confirmAccount };
