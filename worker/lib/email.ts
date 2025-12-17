import type { Env } from "../env";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(env: Env, options: EmailOptions): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log("Email skipped (no RESEND_API_KEY):", options.subject);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Handwriter Helper <noreply@handwriter-helper.com>",
      to: options.to,
      subject: options.subject,
      html: options.html,
    }),
  });

  if (!response.ok) {
    const error = await response.json() as { message?: string };
    console.error("Email failed:", error);
  }
}

export function welcomeEmailTemplate(name: string): { subject: string; html: string } {
  return {
    subject: "Welcome to Handwriter Helper!",
    html: `
      <h1>Welcome, ${name || "there"}!</h1>
      <p>Thank you for signing up for Handwriter Helper.</p>
      <p>Get started by exploring your dashboard.</p>
      <a href="https://handwriter-helper.spinitup.dev/dashboard">Go to Dashboard</a>
    `,
  };
}
