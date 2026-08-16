import { NextResponse } from "next/server";
import { judgeIdeas } from "@/lib/server/respond";
import { badRequest, readJson, requestContext, unauthorized } from "@/lib/server/request";
import type { SourceRef } from "@/types";

export const dynamic = "force-dynamic";

const MAX_IDEAS = 5;

/**
 * Is each angle theirs, or the source restated? No `aiConfigured` gate: the
 * deterministic borrowing check is the real floor here, so this route returns
 * a genuine verdict with no provider key at all.
 */
export async function POST(req: Request) {
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{
    source?: Partial<SourceRef>;
    text?: string;
    ideas?: unknown;
  }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const text = typeof body.text === "string" ? body.text.slice(0, 12_000) : "";
  const ideas = (Array.isArray(body.ideas) ? body.ideas : [])
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      return {
        id: typeof o.id === "string" ? o.id.slice(0, 60) : "",
        hook: typeof o.hook === "string" ? o.hook.trim().slice(0, 240) : "",
        bullets: Array.isArray(o.bullets)
          ? o.bullets
              .filter((b): b is string => typeof b === "string")
              .map((b) => b.trim().slice(0, 240))
              .filter(Boolean)
              .slice(0, 3)
          : [],
      };
    })
    .filter((i) => i.id && i.hook)
    .slice(0, MAX_IDEAS);

  if (ideas.length === 0 || !text) return badRequest("Missing ideas or source.");

  const source: SourceRef = {
    title: typeof body.source?.title === "string" ? body.source.title.slice(0, 160) : "Untitled",
    site: typeof body.source?.site === "string" ? body.source.site.slice(0, 60) : undefined,
    words: typeof body.source?.words === "number" ? body.source.words : 0,
  };

  return NextResponse.json({
    verdicts: await judgeIdeas(ctx.snapshot, source, text, ideas),
  });
}
