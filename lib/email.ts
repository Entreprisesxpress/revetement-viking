// Envoi d'email serveur — supporte 2 fournisseurs (premier configuré gagne) :
// 1. Resend (recommandé, pas de 2FA requise) : RESEND_API_KEY + RESEND_FROM (ex: contrats@revetementviking.com — domaine vérifié dans Resend, OU "onboarding@resend.dev" pour tester sans domaine)
// 2. Gmail SMTP (legacy, requiert App Password 2FA) : GMAIL_USER + GMAIL_APP_PASSWORD
// Toutes les communications sortantes sont brandées "Revêtement Viking Inc."
//
// Réglages facultatifs :
// - RESEND_API_URL      : viser un relais interne (ou un serveur d'essai) au lieu de Resend.
// - EMAIL_NOTIFICATIONS : boîte qui reçoit les AVIS INTERNES (chantier complété, etc.).
//                         Par défaut revetementviking@gmail.com — voir lib/notif-projet.ts.
import nodemailer from "nodemailer";

export interface EmailResult { ok: boolean; raison?: string; messageId?: string; error?: string; }
export interface EmailAttachment { filename: string; content: Buffer | string; contentType?: string }
export interface EmailOpts { to: string; subject: string; text: string; html?: string; replyTo?: string; attachments?: EmailAttachment[]; }

const NOM_EXPEDITEUR = "Revêtement Viking Inc.";
const REPLY_TO_DEFAUT = "revetementviking@gmail.com";

export function emailEstConfigure(): boolean {
  return !!(process.env.RESEND_API_KEY || (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD));
}

export async function sendEmail(opts: EmailOpts): Promise<EmailResult> {
  if (!opts.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(opts.to)) return { ok: false, error: "destinataire invalide" };

  // === Resend (pas de 2FA) ===
  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM || "onboarding@resend.dev"; // dev par défaut
    try {
      const body: any = {
        from: `${NOM_EXPEDITEUR} <${from}>`,
        to: [opts.to],
        reply_to: opts.replyTo || REPLY_TO_DEFAUT,
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      };
      if (opts.attachments?.length) {
        body.attachments = opts.attachments.map((a) => ({
          filename: a.filename,
          content: typeof a.content === "string" ? a.content : a.content.toString("base64"),
        }));
      }
      // Borne de temps : sinon un Resend qui n'aboutit pas gèle l'envoi (et le cron).
      // RESEND_API_URL permet de viser un relais interne — ou un serveur d'essai, pour
      // vérifier un envoi de bout en bout sans écrire à un vrai destinataire.
      const r = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
        signal: AbortSignal.timeout(20_000),
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d: any = await r.json().catch(() => ({}));
      if (r.ok && d.id) return { ok: true, messageId: d.id };
      return { ok: false, error: d.message || `Resend HTTP ${r.status}` };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Resend erreur" };
    }
  }

  // === Gmail SMTP (legacy) ===
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ok: false, raison: "non_configure" };
  try {
    const transporter = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    const info = await transporter.sendMail({
      from: `"${NOM_EXPEDITEUR}" <${user}>`,
      to: opts.to,
      replyTo: opts.replyTo || REPLY_TO_DEFAUT,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: typeof a.content === "string" ? Buffer.from(a.content, "base64") : a.content,
        contentType: a.contentType,
      })),
    });
    return { ok: true, messageId: info.messageId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "erreur SMTP" };
  }
}
