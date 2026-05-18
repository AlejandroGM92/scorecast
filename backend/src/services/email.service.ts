import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function matchReminderHtml(params: {
  username: string;
  homeTeam: string;
  awayTeam: string;
  matchTimeStr: string;
  hasPrediction: boolean;
  appUrl: string;
}): string {
  const { username, homeTeam, awayTeam, matchTimeStr, hasPrediction, appUrl } = params;
  const action = hasPrediction
    ? 'Tu predicción ya está guardada. ¡El partido está a punto de comenzar!'
    : 'Todavía puedes hacer tu predicción. ¡Tienes menos de 1 hora!';
  const cta = hasPrediction ? 'Ver mi predicción' : 'Hacer predicción ahora';

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:520px;margin:32px auto;padding:0 16px;">
    <!-- Header -->
    <div style="text-align:center;padding:24px 0 16px;">
      <span style="font-size:28px;font-weight:900;letter-spacing:-1px;">
        <span style="color:#fff;">SCORE</span><span style="color:#818cf8;">CAST</span>
      </span>
    </div>

    <!-- Card -->
    <div style="background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
      <!-- Match banner -->
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;">⏱ Partido en 1 hora</p>
        <h2 style="margin:8px 0;font-size:22px;font-weight:700;color:#fff;">${homeTeam} vs ${awayTeam}</h2>
        <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.8);">🕐 ${matchTimeStr}</p>
      </div>

      <!-- Body -->
      <div style="padding:24px;">
        <p style="margin:0 0 12px;font-size:16px;">Hola <strong>${username}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6;">${action}</p>

        <div style="text-align:center;">
          <a href="${appUrl}/matches"
             style="display:inline-block;padding:12px 32px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
            ${cta}
          </a>
        </div>
      </div>

      <!-- Points reminder -->
      <div style="border-top:1px solid rgba(255,255,255,0.08);padding:16px 24px;background:rgba(255,255,255,0.02);">
        <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Sistema de puntos</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <span style="font-size:12px;color:#94a3b8;">✅ Marcador exacto: <strong style="color:#fff;">3 pts</strong></span>
          <span style="font-size:12px;color:#94a3b8;">⚽ Resultado: <strong style="color:#fff;">2 pts</strong></span>
          <span style="font-size:12px;color:#94a3b8;">🎯 Goles: <strong style="color:#fff;">1 pt</strong></span>
        </div>
      </div>
    </div>

    <p style="text-align:center;font-size:11px;color:#334155;margin-top:16px;">
      © 2026 SCORECAST · <a href="${appUrl}" style="color:#4f46e5;text-decoration:none;">scorecast.app</a>
    </p>
  </div>
</body>
</html>`;
}

export async function sendMatchReminderEmail(params: {
  to: string;
  username: string;
  homeTeam: string;
  awayTeam: string;
  matchTime: Date;
  hasPrediction: boolean;
}): Promise<boolean> {
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== 'true') return false;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return false;

  const { to, username, homeTeam, awayTeam, matchTime, hasPrediction } = params;
  const appUrl = process.env.FRONTEND_URL || 'http://localhost:5175';

  const matchTimeStr = matchTime.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"SCORECAST" <${process.env.SMTP_USER}>`,
      to,
      subject: `⚽ ${homeTeam} vs ${awayTeam} — ¡En 1 hora!`,
      html: matchReminderHtml({ username, homeTeam, awayTeam, matchTimeStr, hasPrediction, appUrl }),
    });
    return true;
  } catch (error) {
    logger.error(`❌ Failed to send email to ${to}:`, error);
    return false;
  }
}
