import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const allowedImages = new Set([
  "agent-news.png",
  "agent-marche.png",
  "agent-methode-xavier.png",
  "agent-coherence-radar.png",
]);

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!allowedImages.has(name)) {
    return NextResponse.json({ ok: false, error: "Image inconnue." }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", "agents", name);
  const file = await readFile(filePath);

  return new NextResponse(file, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
