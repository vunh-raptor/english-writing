import { NextResponse } from "next/server";
import { applyAction, loadState, type StateAction } from "@/lib/server/db/state";
import { supabaseServer, getUserId } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * The learner's durable state. GET reads it, POST applies one action and hands
 * back the fresh whole — so the client never has to guess what a write implied
 * elsewhere, and cannot drift from the server's view.
 *
 * Both run as the signed-in user (`supabaseServer()`, not the admin client), so
 * RLS is the thing actually enforcing ownership rather than a `where` clause we
 * have to remember to write.
 */

const ACTIONS = new Set([
  "updateSettings",
  "setLevel",
  "issueWordDay",
  "finishWordSession",
  "reviewPhrases",
  "collectPhrase",
  "removePhrase",
  "keepMisheard",
  "saveRespondSession",
  "removeRespondSession",
  "saveTranscribeSession",
  "removeTranscribeSession",
  "reset",
]);

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  try {
    return NextResponse.json(await loadState(supabaseServer(), userId));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't load your work." },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = body as StateAction;
  if (!action || typeof action !== "object" || !ACTIONS.has(action.type)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  try {
    return NextResponse.json(await applyAction(supabaseServer(), userId, action));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That didn't save." },
      { status: 502 },
    );
  }
}
