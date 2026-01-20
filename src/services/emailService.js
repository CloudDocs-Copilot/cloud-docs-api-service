
import nodemailer from 'nodemailer';

export async function sendConfirmationEmail(to, subject, html) {
  // Configura el transporte de nodemailer para Mailtrap dentro de la función
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html
  };
  return transporter.sendMail(mailOptions);
}
