import bcrypt from 'bcryptjs';
import { signToken } from './jwt.service';
import User, { IUser } from '../models/user.model';
import { validatePasswordOrThrow } from '../utils/password-validator';
import HttpError from '../models/error.model';
import { sendConfirmationEmail } from '../mail/emailService';
import { randomBytes, createHash } from 'crypto';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

/**
 * DTO para registro de usuario
 */
export interface RegisterUserDto {
  name: string;
  email: string;
  password: string;
  role?: 'user' | 'admin';
}

/**
 * DTO para inicio de sesión
 */
export interface LoginUserDto {
  email: string;
  password: string;
}

/**
 * Respuesta de autenticación con token y datos de usuario
 */
export interface AuthResponse {
  token: string;
  user: Partial<IUser>;
}

/**
 * Escapa caracteres especiales para uso seguro en HTML
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"'\/]/g, (s) => {
    const entityMap: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
    };
    return entityMap[s] || s;
  });
}

/** Constantes y funciones auxiliares para reseteo de contraseña */
const PASSWORD_RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hora

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}


/**
 * Registra un nuevo usuario en el sistema
 * El usuario se registra sin organización ni rootFolder
 * El rootFolder se crea cuando el usuario se une o crea una organización (en Membership)
 * 
 * Valida la fortaleza de la contraseña antes de hashearla
 * Hashea la contraseña antes de almacenarla
 * 
 * @param RegisterUserDto - Datos del usuario a registrar
 * @returns Usuario creado (sin contraseña)
 * @throws HttpError si la contraseña no cumple los requisitos de seguridad
 * @throws HttpError si el email ya está registrado
 */
export async function registerUser({ 
  name, 
  email, 
  password,
  role = 'user' 
}: RegisterUserDto): Promise<Partial<IUser>> {
  // Validar nombre (solo alfanumérico y espacios)
  const nameRegex = /^[a-zA-Z0-9\s]+$/;
  if (!name || !nameRegex.test(name.trim())) {
    throw new HttpError(400, 'Name must contain only alphanumeric characters and spaces');
  }
  
  // Validar formato de email
  const emailRegex = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;
  if (!email || !emailRegex.test(email.toLowerCase())) {
    throw new HttpError(400, 'Invalid email format');
  }

  // Validar fortaleza de la contraseña
  validatePasswordOrThrow(password);
  
  // Hashear contraseña
  const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  
  // En entorno de test, activar usuarios automáticamente (sin confirmación de email)
  const isTestEnv = process.env.NODE_ENV === 'test';
  
  try {
    // Crear usuario sin organización ni rootFolder
    const user = await User.create({ 
      name, 
      email, 
      password: hashed, 
      role,
      organization: undefined,
      rootFolder: undefined,
      storageUsed: 0,
      active: isTestEnv // Activo en tests, inactivo en producción hasta confirmar email
    });
    
    // --- Envío de email de confirmación ---
    const sendEmail = String(process.env.SEND_CONFIRMATION_EMAIL).toLowerCase() === 'true';
    if (sendEmail) {
      try {
        
        const fs = await import('fs');
        const path = await import('path');
        const jwt = await import('jsonwebtoken');
        // Generar token de confirmación (JWT simple)
        const token = jwt.default.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
        // Usar variable de entorno para la URL base de confirmación
        const baseUrl = process.env.CONFIRMATION_URL_BASE || `http://localhost:${process.env.PORT || 4000}`;
        const confirmationUrl = `${baseUrl}/api/auth/confirm/${token}`;
        // Leer y personalizar el template HTML
        const templatePath = path.default.join(process.cwd(), 'src', 'mail', 'confirmationTemplate.html');
        let html = fs.default.readFileSync(templatePath, 'utf8');
        const safeName = escapeHtml(name);
        html = html.replace('{{name}}', safeName).replace('{{confirmationUrl}}', confirmationUrl);
        console.log('Enviando email de confirmación...');
        await sendConfirmationEmail(email, 'Confirma tu cuenta en CloudDocs Copilot', html);
        console.log('Email de confirmación enviado');
      } catch (emailErr) {
        console.error('Error enviando email de confirmación:', emailErr);
      }
    }

    // Retornar datos del usuario (incluyendo _id manualmente)
    const userObj = user.toJSON();
    return {
      ...userObj,
      _id: user._id,
    };
  } catch (error) {
    // Re-lanzar el error original
    throw error;
  }
}

/**
 * Autentica un usuario y genera un token JWT
 * Valida las credenciales y retorna el token de acceso
 * 
 * @param LoginUserDto - Credenciales del usuario
 * @returns Token JWT y datos del usuario
 * @throws HttpError si las credenciales son inválidas
 */
export async function loginUser({ email, password }: LoginUserDto): Promise<AuthResponse> {
  // Validar explícitamente los tipos para evitar inyección NoSQL u otros valores inesperados
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw new HttpError(400, 'Invalid credentials');
  }

  const user = await User.findOne({ email: { $eq: email } });
  if (!user) throw new HttpError(404, 'User not found');
  
  // Validar que el usuario esté activo
  if (!user.active) {
    throw new HttpError(403, 'User account is not active');
  }
  
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new HttpError(401, 'Invalid password');
  
  const token = signToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion
  });
  
  return { token, user: user.toJSON() };
}

/**
 * Confirma la cuenta de usuario mediante el token recibido
 * Activa el usuario si el token es válido
 * @param token - Token JWT de confirmación
 * @returns Información sobre el estado de la activación
 * @throws Error si el token es inválido o el usuario no existe
 */
export async function confirmUserAccount(token: string): Promise<{ userId: string, userName: string, userAlreadyActive: boolean }> {
  const jwt = await import('jsonwebtoken');
  const payload: any = jwt.default.verify(token, process.env.JWT_SECRET || 'secret');
  const user = await User.findById(payload.userId);
  if (!user) {
    throw new Error('User not found');
  }
  if (user.active) {
    // El token de confirmación no se almacena en localStorage, la activación se gestiona por cookies en el flujo de login
    return { userId: user._id, userName: user.name, userAlreadyActive: true };
  }
  user.active = true;
  await user.save();
  // La activación se gestiona por cookies, no por localStorage
  return { userId: user._id, userName: user.name, userAlreadyActive: false };
}


/** Reseteo de contraseña */
export async function requestPasswordReset(email: string): Promise<string | null> {
  // Validar tipo para evitar inyección/valores raros
  if (typeof email !== 'string' || !email) {
    throw new HttpError(400, 'Missing required fields');
  }

  // Validar formato de email (mismo criterio que register)
  const emailRegex = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;
  const normalizedEmail = email.toLowerCase();
  if (!emailRegex.test(normalizedEmail)) {
    throw new HttpError(400, 'Invalid email format');
  }

  const user = await User.findOne({ email: { $eq: normalizedEmail } });

  // Anti-enumeración: si no existe, no revelamos nada
  if (!user) return null;

  // Si la cuenta no está activa: reenviar confirmación (si está habilitado el envío)
  if (!user.active) {
    const sendEmail = String(process.env.SEND_CONFIRMATION_EMAIL).toLowerCase() === 'true';
    if (sendEmail) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const jwt = await import('jsonwebtoken');

        const token = jwt.default.sign(
          { userId: user._id },
          process.env.JWT_SECRET || 'secret',
          { expiresIn: '1d' }
        );

        const baseUrl =
          process.env.CONFIRMATION_URL_BASE || `http://localhost:${process.env.PORT || 4000}`;
        const confirmationUrl = `${baseUrl}/api/auth/confirm/${token}`;

        const templatePath = path.default.join(process.cwd(), 'src', 'mail', 'confirmationTemplate.html');
        let html = fs.default.readFileSync(templatePath, 'utf8');
        const safeName = escapeHtml(user.name);
        html = html.replace('{{name}}', safeName).replace('{{confirmationUrl}}', confirmationUrl);

        await sendConfirmationEmail(user.email, 'Confirma tu cuenta en CloudDocs Copilot', html);
      } catch (emailErr) {
        console.error('Error reenviando email de confirmación:', emailErr);
      }
    }
    return null;
  }

  // Generar token raw (solo se manda por email), guardar solo hash
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);

  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MS);
  user.passwordResetRequestedAt = new Date();
  await user.save();

  // Enviar email (si está habilitado)
  const sendEmail = String(process.env.SEND_CONFIRMATION_EMAIL).toLowerCase() === 'true';
  if (sendEmail) {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const frontendBase = (process.env.CONFIRMATION_FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
      const resetUrl = `${frontendBase}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;

      const templatePath = path.default.join(process.cwd(), 'src', 'mail', 'passwordResetTemplate.html');
      let html = fs.default.readFileSync(templatePath, 'utf8');
      const safeName = escapeHtml(user.name);
      html = html.replace('{{name}}', safeName).replace('{{resetUrl}}', resetUrl);

      await sendConfirmationEmail(user.email, 'Restablece tu contraseña en CloudDocs Copilot', html);
    } catch (emailErr) {
      console.error('Error enviando email de reset:', emailErr);
    }
  }

  return rawToken;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export async function resetPassword({ token, newPassword, confirmPassword }: ResetPasswordDto): Promise<void> {
  if (typeof token !== 'string' || typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
    throw new HttpError(400, 'Missing required fields');
  }
  if (!token || !newPassword || !confirmPassword) {
    throw new HttpError(400, 'Missing required fields');
  }

  if (newPassword !== confirmPassword) {
    throw new HttpError(400, 'Passwords do not match');
  }

  // Política de contraseñas (reutiliza lo existente)
  validatePasswordOrThrow(newPassword);

  const tokenHash = hashResetToken(token);

  const user = await User.findOne({
    passwordResetTokenHash: { $eq: tokenHash },
    passwordResetExpires: { $gt: new Date() }
  });

  if (!user) {
    // Reutilizable por front como alerta estándar
    throw new HttpError(400, 'Invalid or expired token');
  }

  const hashed = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  user.password = hashed;

  // Invalidar sesiones existentes
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.lastPasswordChange = new Date();

  // Limpiar token para impedir reutilización
  user.passwordResetTokenHash = null;
  user.passwordResetExpires = null;
  user.passwordResetRequestedAt = null;

  await user.save();

  // Email de confirmación (si está habilitado)
  const sendEmail = String(process.env.SEND_CONFIRMATION_EMAIL).toLowerCase() === 'true';
  if (sendEmail) {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const templatePath = path.default.join(process.cwd(), 'src', 'mail', 'passwordChangedTemplate.html');
      let html = fs.default.readFileSync(templatePath, 'utf8');
      const safeName = escapeHtml(user.name);
      html = html.replace('{{name}}', safeName);

      await sendConfirmationEmail(user.email, 'Tu contraseña ha sido cambiada en CloudDocs Copilot', html);
    } catch (emailErr) {
      console.error('Error enviando email de confirmación de cambio:', emailErr);
    }
  }
}

export default {
  registerUser,
  loginUser
};
