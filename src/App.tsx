import { useState } from "react";
import { useStore } from "./store/StoreContext";
import type { Entry, Prompt } from "./types";
import { Home } from "./components/Home";
import { Write } from "./components/Write";
import { Celebrate } from "./components/Celebrate";
import { Feedback } from "./components/Feedback";
import { Progress } from "./components/Progress";
import { Settings } from "./components/Settings";

type View = "home" | "write" | "celebrate" | "feedback" | "progress" | "settings";

export function App() {
  const { store, finishSession } = useStore();
  const [view, setView] = useState<View>("home");
  const [writePrompt, setWritePrompt] = useState<Prompt | null>(null);
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null);

  function startWriting(p: Prompt) {
    setWritePrompt(p);
    setView("write");
  }

  function handleFinish(text: string, durationMs: number) {
    if (!writePrompt) return;
    const entry = finishSession({
      promptId: writePrompt.id,
      promptText: writePrompt.text,
      text,
      durationMs,
    });
    setActiveEntry(entry);
    setView("celebrate");
  }

  // The writing screen is its own full-screen, distraction-free surface.
  if (view === "write" && writePrompt) {
    return (
      <Write
        prompt={writePrompt}
        goalType={store.settings.goalType}
        goalValue={store.settings.goalValue}
        gentleNudge={store.settings.gentleNudge}
        onFinish={handleFinish}
        onExit={() => setView("home")}
      />
    );
  }

  const showNav = view === "home" || view === "progress" || view === "settings";

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-inner">
          <button className="brand" onClick={() => setView("home")}>
            <span className="brand-dot" />
            Flowrite
          </button>
          {showNav && (
            <nav className="nav">
              <button
                className={view === "home" ? "active" : ""}
                onClick={() => setView("home")}
              >
                Write
              </button>
              <button
                className={view === "progress" ? "active" : ""}
                onClick={() => setView("progress")}
              >
                Progress
              </button>
              <button
                className={view === "settings" ? "active" : ""}
                onClick={() => setView("settings")}
              >
                Settings
              </button>
            </nav>
          )}
        </div>
      </header>

      {view === "home" && <Home onStart={startWriting} />}
      {view === "progress" && <Progress />}
      {view === "settings" && <Settings />}
      {view === "celebrate" && activeEntry && (
        <Celebrate
          entry={activeEntry}
          onFeedback={() => setView("feedback")}
          onDone={() => setView("home")}
        />
      )}
      {view === "feedback" && activeEntry && (
        <Feedback entry={activeEntry} onBack={() => setView("home")} />
      )}
      {/* Fallbacks if we somehow land on a moment screen without an entry. */}
      {(view === "celebrate" || view === "feedback") && !activeEntry && (
        <Home onStart={startWriting} />
      )}
    </div>
  );
}
