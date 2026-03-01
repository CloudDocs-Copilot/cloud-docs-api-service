import nodemailer from 'nodemailer';
import type { SentMessageInfo } from 'nodemailer';

export async function sendConfirmationEmail(
  to: string,
  subject: string,
  html: string
): Promise<SentMessageInfo> {
  // Flag de prueba para permitir certificados TLS no válidos (solo testing)
  const allowInsecureTls =
    (process.env.EMAIL_ALLOW_INSECURE_TLS || 'false').toLowerCase() === 'true';

  // Determinar si usar secure (true normalmente para puerto 465)
  const port = Number(process.env.EMAIL_PORT || '587');
  const secure = (process.env.EMAIL_SECURE || '').toLowerCase() === 'true' || port === 465;

  // Configura el transporte de nodemailer
  // Handle CJS/ESM interop: tests may mock either `createTransport` on the module
  // or on the `default` export. Prefer a found function in either place.
  const mod = nodemailer as unknown as Record<string, unknown>;

  type TransporterLike = { sendMail: (opts: unknown) => Promise<SentMessageInfo> };

  let createTransportFn: ((opts: unknown) => TransporterLike) | undefined;

  if (typeof mod.createTransport === 'function') {
    createTransportFn = mod.createTransport as (opts: unknown) => TransporterLike;
  } else if (mod.default && typeof (mod.default as Record<string, unknown>).createTransport === 'function') {
    createTransportFn = (mod.default as Record<string, unknown>).createTransport as (
      opts: unknown
    ) => TransporterLike;
  }

  if (!createTransportFn) {
    throw new Error('nodemailer.createTransport is not available');
  }

  const transporter = createTransportFn({
    host: process.env.EMAIL_HOST,
    port,
    secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      // Por defecto Nodemailer verifica el certificado del servidor.
      // Para pruebas puntuales (no recomendado en producción) se puede permitir certificados no verificados.
      rejectUnauthorized: !allowInsecureTls
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html
  };

  // Await sendMail to keep async/await usage explicit and satisfy lint rules
  return await transporter.sendMail(mailOptions);
}
