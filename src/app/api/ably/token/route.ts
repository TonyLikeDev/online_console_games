import * as Ably from "ably";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_ID_RE = /^(screen-[A-Z]{4}|p-[a-f0-9]{16})$/;

/**
 * Mints a short-lived Ably token so the API key never reaches the browser.
 * Clients may only use room channels.
 */
export async function GET(request: NextRequest) {
  const key = process.env.ABLY_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "ABLY_API_KEY is not set. Add it to .env.local or set NEXT_PUBLIC_TRANSPORT=local." },
      { status: 503 },
    );
  }
  const clientId = request.nextUrl.searchParams.get("clientId") ?? "";
  if (!CLIENT_ID_RE.test(clientId)) {
    return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
  }
  const rest = new Ably.Rest({ key });
  const tokenRequest = await rest.auth.createTokenRequest({
    clientId,
    ttl: 2 * 60 * 60 * 1000,
    capability: { "room:*": ["publish", "subscribe", "presence"] },
  });
  return NextResponse.json(tokenRequest, { headers: { "Cache-Control": "no-store" } });
}
