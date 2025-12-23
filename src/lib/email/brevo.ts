// src/lib/email/brevo.ts
type SendInviteArgs = {
  toEmail: string;
  toName?: string;
  tenantName: string;
  inviterName: string;
  inviteUrl: string;
  roleLabel: string;
};

export async function sendInviteEmail(args: SendInviteArgs) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "FlyImob";

  if (!apiKey || !senderEmail) {
    console.warn("Brevo não configurado (BREVO_API_KEY / BREVO_SENDER_EMAIL). Pulando envio.");
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5">
      <h2>Convite para ${args.tenantName}</h2>
      <p>Olá${args.toName ? `, ${args.toName}` : ""}!</p>
      <p><b>${args.inviterName}</b> convidou você para acessar o painel do FlyImob como <b>${args.roleLabel}</b>.</p>
      <p>Para aceitar, defina sua senha aqui:</p>
      <p><a href="${args.inviteUrl}">${args.inviteUrl}</a></p>
      <p style="color:#666; font-size:12px">Se você não esperava este convite, ignore este e-mail.</p>
    </div>
  `;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: args.toEmail, name: args.toName }],
      subject: `Seu convite para ${args.tenantName}`,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Brevo error: ${res.status} ${t}`);
  }
}
