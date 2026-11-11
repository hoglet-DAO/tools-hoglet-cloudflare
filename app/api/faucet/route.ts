// app/api/faucet/route.ts
import { NextResponse } from 'next/server';
import { clientKey, pruneBuckets, rateLimited } from '@/lib/move/rateLimit';

/** Move addresses must be 0x-prefixed and contain 1 to 64 hexadecimal characters */
function isMoveAddress(value: string | null): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address')?.trim() ?? null;

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  if (!isMoveAddress(address)) {
    return NextResponse.json(
      { error: "invalid address: expected 0x followed by 1..64 hex digits" },
      { status: 400 }
    );
  }

  // Rate limit: max 2 faucet requests per minute per IP to protect testnet funds and avoid upstream bans
  const key = clientKey(request);
  pruneBuckets(Date.now());
  if (rateLimited(key, "faucet", 2, 60_000)) {
    return NextResponse.json(
      { error: "too many faucet requests, retry shortly" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const targetUrl = `https://rpc-testnet.supra.com/rpc/v1/wallet/faucet/${encodeURIComponent(address)}`;
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: `upstream HTTP error ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    const isTimeout = error?.name === "AbortError";
    return NextResponse.json(
      { error: isTimeout ? "faucet request timed out" : error.message || "faucet error" },
      { status: isTimeout ? 504 : 500 }
    );
  } finally {
    clearTimeout(timer);
  }
}

