import { Suspense } from "react";
import { SignIn } from "@/components/SignIn";

/** Outside the `(main)` group on purpose — no rail, no tab bar, one job. */
export default function SignInPage() {
  return (
    <Suspense fallback={<div className="app-boot" aria-hidden="true" />}>
      <SignIn />
    </Suspense>
  );
}
