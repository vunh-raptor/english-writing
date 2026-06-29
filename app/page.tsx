"use client";

import dynamic from "next/dynamic";

/**
 * The writing experience is a fully client-side app (it uses browser storage,
 * audio, timers). We load it with `ssr: false` so Next doesn't try to render
 * browser-only code on the server. As we move state to the API (Phase 1), parts
 * of this will become server-rendered.
 */
const Root = dynamic(() => import("../src/Root"), {
  ssr: false,
  loading: () => <div className="app-boot" aria-hidden="true" />,
});

export default function Page() {
  return <Root />;
}
