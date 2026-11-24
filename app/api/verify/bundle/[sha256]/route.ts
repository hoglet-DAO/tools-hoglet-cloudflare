import { createZip, type ZipEntry } from "@/lib/move/zip";
import { envOr503, json, NO_STORE } from "@/lib/verify/http";
import { getBundle } from "@/lib/verify/store";

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sha256: string }> }
) {
  const { sha256 } = await params;
  if (!/^[0-9a-f]{64}$/.test(sha256)) return json({ ok: false, error: "invalid bundle hash" }, 400);

  const envResult = envOr503();
  if (!envResult.ok) return envResult.response;

  let bundle;
  try {
    bundle = await getBundle(envResult.env, sha256);
  } catch {
    return json({ ok: false, error: "could not read the bundle" }, 502);
  }
  if (!bundle) return json({ ok: false, error: "bundle not found" }, 404);

  const filename = `${safeName(bundle.package)}-${bundle.upgradeNumber}`;

  if (new URL(request.url).searchParams.get("format") === "zip") {
    const entries: ZipEntry[] = [
      { path: "Move.toml", content: bundle.manifest },
      ...Object.entries(bundle.files).map(([path, content]) => ({ path, content })),
    ];
    const bytes = createZip(entries);
    return new Response(new Blob([bytes.buffer as ArrayBuffer]), {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}.zip"`,
      },
    });
  }

  return new Response(JSON.stringify(bundle), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    },
  });
}
