import { redirect } from "next/navigation";

/**
 * The day starts with today's words — that's the habit everything else hangs
 * off, so "/" is simply the way in to it.
 */
export default function RootPage() {
  redirect("/words");
}
