import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/server/supabaseMiddleware";

/**
 * Keep the Supabase auth session fresh on navigations. No-ops cleanly when
 * Supabase isn't configured or the visitor is a guest (see updateSession).
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every path except Next.js internals and static asset files —
     * those never carry an auth session to refresh.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
