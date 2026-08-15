import type { Job } from "@/lib/types";
import { formatJobLine } from "@/lib/jobs";

export type NotifyResult = {
  slack: boolean;
  discord: boolean;
  email: boolean;
  errors: string[];
};

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

export async function notifyNewJobs(jobs: Job[], query: string): Promise<NotifyResult> {
  const result: NotifyResult = {
    slack: false,
    discord: false,
    email: false,
    errors: [],
  };
  if (jobs.length === 0) return result;

  const header = `${jobs.length} new job opening${jobs.length === 1 ? "" : "s"} for “${query}”`;
  const lines = jobs.slice(0, 20).map(formatJobLine).join("\n");
  const text = `${header}\n\n${lines}`;

  const slackUrl = process.env.SLACK_WEBHOOK_URL?.trim();
  if (slackUrl) {
    try {
      await postJson(slackUrl, { text });
      result.slack = true;
    } catch (error) {
      result.errors.push(
        `Slack: ${error instanceof Error ? error.message : "failed"}`
      );
    }
  }

  const discordUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (discordUrl) {
    try {
      await postJson(discordUrl, { content: text.slice(0, 1900) });
      result.discord = true;
    } catch (error) {
      result.errors.push(
        `Discord: ${error instanceof Error ? error.message : "failed"}`
      );
    }
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const notifyEmail = process.env.NOTIFY_EMAIL?.trim();
  if (resendKey && notifyEmail) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.NOTIFY_FROM?.trim() || "Job Search Bot <beth.t@example.com>",
          to: [notifyEmail],
          subject: header,
          text,
        }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      result.email = true;
    } catch (error) {
      result.errors.push(
        `Email: ${error instanceof Error ? error.message : "failed"}`
      );
    }
  }

  return result;
}

export function configuredChannels(): {
  slack: boolean;
  discord: boolean;
  email: boolean;
  adzuna: boolean;
  jsearch: boolean;
  reed: boolean;
  jooble: boolean;
} {
  return {
    slack: Boolean(process.env.SLACK_WEBHOOK_URL?.trim()),
    discord: Boolean(process.env.DISCORD_WEBHOOK_URL?.trim()),
    email: Boolean(
      process.env.RESEND_API_KEY?.trim() && process.env.NOTIFY_EMAIL?.trim()
    ),
    adzuna: Boolean(
      process.env.ADZUNA_APP_ID?.trim() && process.env.ADZUNA_APP_KEY?.trim()
    ),
    jsearch: Boolean(
      process.env.JSEARCH_API_KEY?.trim() || process.env.RAPIDAPI_KEY?.trim()
    ),
    reed: Boolean(process.env.REED_API_KEY?.trim()),
    jooble: Boolean(process.env.JOOBLE_API_KEY?.trim()),
  };
}
