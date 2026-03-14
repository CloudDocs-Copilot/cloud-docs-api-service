import sgMail from '@sendgrid/mail';

export interface SendGridResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, unknown>;
}

/**
 * Envía un correo de confirmación usando la API de SendGrid
 * Migrado de nodemailer/SMTP a SendGrid API para compatibilidad con Render
 *
 * @param to - Dirección de correo del destinatario
 * @param subject - Asunto del correo
 * @param html - Contenido HTML del correo
 * @returns Respuesta de SendGrid con statusCode, body y headers
 * @throws Error si falta el API Key o hay problema con SendGrid
 */
export async function sendConfirmationEmail(
  to: string,
  subject: string,
  html: string
): Promise<SendGridResponse> {
  // Validar que el API Key está configurado
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY environment variable is not configured');
  }

  // Configurar la API key
  sgMail.setApiKey(apiKey);

  // Validar que el correo "from" está configurado
  const fromEmail = process.env.EMAIL_USER || process.env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error(
      'EMAIL_USER or SENDGRID_FROM_EMAIL environment variable is required'
    );
  }

  // Construir el mensaje de acuerdo con la interfaz de SendGrid
  const msg = {
    to,
    from: fromEmail,
    subject,
    html
  };

  // Enviar usando la API de SendGrid
  // sgMail.send retorna un array con la respuesta
  const response = await sgMail.send(msg);

  // SendGrid retorna un array, tomamos el primer elemento
  const [sendGridResponse] = response;

  return {
    statusCode: sendGridResponse.statusCode,
    body: sendGridResponse.body,
    headers: sendGridResponse.headers as Record<string, unknown>
  };
}
