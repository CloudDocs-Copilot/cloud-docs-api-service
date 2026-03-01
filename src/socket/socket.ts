import type http from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

// Custom socket data type
interface CustomSocketData {
  userId: string;
}

let io: Server | null = null;

type JwtPayload = {
  id?: string;
  userId?: string;
  sub?: string;
  // ...anything else your token includes
};

function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail fast: without JWT secret, we cannot auth sockets safely.
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

function extractTokenFromHandshake(socket: Socket): string | null {
  // Option A: Authorization: Bearer <token>
  const authHeader =
    socket.handshake.headers?.authorization ||
    socket.handshake.headers?.Authorization;

  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
  }

  // Option B: socket.handshake.auth.token (client can pass it here)
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;
  const authToken = auth?.token;
  if (authToken && typeof authToken === 'string') {
    return authToken;
  }

  // Option C: cookie "token=<jwt>" (if you store JWT in cookies)
  const cookieHeader = socket.handshake.headers?.cookie;
  if (cookieHeader && typeof cookieHeader === 'string') {
    const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
    if (match && match[1]) return decodeURIComponent(match[1]);
  }

  return null;
}

function getUserIdFromToken(token: string): string | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Support common shapes:
    // - { id: "..." }
    // - { userId: "..." }
    // - { sub: "..." }
    const userId = decoded.id || decoded.userId || decoded.sub;
    return userId && typeof userId === 'string' ? userId : null;
  } catch {
    return null;
  }
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Initialize Socket.IO and attach to HTTP server.
 * Clients must be authenticated via JWT.
 */
export function initSocket(server: http.Server): Server {
  if (io) return io;

  const allowedOrigins = getAllowedOrigins();

  io = new Server(server, {
    path: '/socket.io',
    cors: {
      origin: (origin, cb): void => {
        // Allow same-origin / server-to-server / curl
        if (!origin) return cb(null, true);

        // If ALLOWED_ORIGINS is empty, be safe and reject cross-origin
        if (allowedOrigins.length === 0) return cb(new Error('CORS blocked'), false);

        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('CORS blocked'), false);
      },
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  // Auth middleware for sockets
  io.use((socket, next) => {
    const token = extractTokenFromHandshake(socket);
    if (!token) return next(new Error('Unauthorized'));

    const userId = getUserIdFromToken(token);
    if (!userId) return next(new Error('Unauthorized'));

    (socket.data as CustomSocketData).userId = userId;
    next();
  });

  io.on('connection', socket => {
    const socketData = socket.data as CustomSocketData;
    const userId = socketData.userId;
    void socket.join(userRoom(userId));

    // Optional: allow the client to confirm it's connected
    socket.emit('socket:connected', { userId });

    socket.on('disconnect', () => {
      // no-op; rooms are cleaned automatically
    });
  });

  return io;
}

/**
 * Emit an event to a specific user (all active sockets of that user).
 * Safe to call even if Socket.IO not initialized yet.
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
}

/**
 * Optional helper if you want to broadcast to an organization room later.
 * (Not used yet, but nice to have for org-wide "announcements".)
 */
export function emitToOrg(orgId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`org:${orgId}`).emit(event, payload);
}
