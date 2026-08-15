import { NextResponse } from "next/server";
import { defaultSearchInput } from "@/lib/jobs";
import { configuredChannels } from "@/lib/notify";

export async function GET() {
  const search = defaultSearchInput();
  const channels = configuredChannels();
  return NextResponse.json({
    search,
    cron: {
      secretSet: Boolean(process.env.CRON_SECRET?.trim()),
      schedule: "0 8 * * *",
      timezone: "UTC",
    },
    integrations: channels,
  });
}
