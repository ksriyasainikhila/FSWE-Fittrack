import nodemailer from 'nodemailer';
export async function sendEmail({to, subject, text, html}) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`[email skipped: SMTP not configured] to=${to} subject=${subject}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: Number(SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  await transporter.sendMail({ from: EMAIL_FROM || SMTP_USER, to, subject, text, html });
}
