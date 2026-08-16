import "server-only";
import { NextResponse } from "next/server";
import type { Db } from "./supabase";
import type { LearnerSnapshot } from "@/lib/shared/prompt";
import { getUserId, supabaseServer } from "./supabase";
import { loadSnapshot } from "./db/context";

/**
 * What every AI route needs before it can do anything: who is asking, a client
 * bound to them, and what the app knows about them.
 *
 * Each route used to open with the same six lines — read the level off the
 * request body, trust it, call the model. Two things changed that. The level
 * now comes from the database rather than the client (a request could always
 * claim C1; the profile can't), and every prompt reads the learner's record, so
 * the snapshot has to be built once per request and passed down rather than
 * refetched by each job that wants a facet of it.
 */

export interface RequestContext {
  db: Db;
  userId: string;
  snapshot: LearnerSnapshot;
}

/**
 * Resolve the caller, or null when there is no validated session.
 *
 * Middleware already answers an unauthenticated API call with 401, so null here
 * is belt-and-braces — but it is the seam that makes every handler's first line
 * identical, and identical is what stops one of them forgetting.
 */
export async function requestContext(): Promise<RequestContext | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const db = supabaseServer();
  return { db, userId, snapshot: await loadSnapshot(db, userId) };
}

// ---------------------------------------------------------------------------
// The four answers every AI route gives
// ---------------------------------------------------------------------------
//
// Seventeen handlers were each spelling these out, which is seventeen chances
// for one of them to return a different status for the same condition. The
// wording is learner-facing, so it lives in one place too.

/** No validated session. Middleware normally catches this first. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
}

/**
 * No provider key. Every mode needs one now that nothing is bundled, so this
 * says what is actually wrong rather than pretending the request was bad.
 */
export function aiUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "This needs a server AI key — nothing in Flowrite is pre-written." },
    { status: 503 },
  );
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** An upstream failure, carrying whatever the module chose to say about it. */
export function upstreamFailed(e: unknown, fallback: string): NextResponse {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : fallback },
    { status: 502 },
  );
}

/** Parse a JSON body, or null when it wasn't JSON. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
