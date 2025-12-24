// src/lib/brevo.server.ts
type SendTemplateArgs = {
  toEmail: string;
  toName?: string;
  templateId: number;
  params?: Record<string, any>;
};

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function sendBrevoTemplateEmail(args: SendTemplateArgs) {
  const apiKey = requiredEnv("BREVO_API_KEY");
  const senderName = requiredEnv("BREVO_SENDER_NAME");
  const senderEmail = requiredEnv("BREVO_SENDER_EMAIL");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: args.toEmail, name: args.toName ?? args.toEmail }],
      templateId: args.templateId,
      params: args.params ?? {},
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
  }
}
