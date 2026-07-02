import { useState } from "react";
import { useStore } from "./store/StoreContext";
import type { Entry, Prompt, Scenario, WriteSession } from "./types";
import { Home } from "./components/Home";
import { Write } from "./components/Write";
import { Celebrate } from "./components/Celebrate";
import { Feedback } from "./components/Feedback";
import { Progress } from "./components/Progress";
import { Settings } from "./components/Settings";
import { Trending } from "./components/Trending";
import { Coach } from "./components/Coach";

type View =
  | "home"
  | "trending"
  | "coach"
  | "write"
  | "celebrate"
  | "feedback"
  | "progress"
  | "settings";

export function App() {
  const { store, finishSession } = useStore();
  const [view, setView] = useState<View>("home");
  const [writeSession, setWriteSession] = useState<WriteSession | null>(null);
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null);

  function startWriting(p: Prompt) {
    setWriteSession({
      promptId: p.id,
      subject: p.text,
      beats: [{ id: p.id, prompt: p.text, starter: p.starter }],
    });
    setView("write");
  }

  function startScenario(s: Scenario) {
    setWriteSession({
      promptId: s.id,
      subject: s.subject,
      platform: s.platform,
      beats: s.steps.map((step) => ({
        id: step.id,
        prompt: step.prompt,
        starter: step.starter,
        hint: step.hint,
      })),
    });
    setView("write");
  }

  function handleFinish(text: string, durationMs: number) {
    if (!writeSession) return;
    const entry = finishSession({
      promptId: writeSession.promptId,
      promptText: writeSession.subject,
      text,
      durationMs,
    });
    setActiveEntry(entry);
    setView("celebrate");
  }

  // The writing screen is its own full-screen, distraction-free surface.
  if (view === "write" && writeSession) {
    return (
      <Write
        session={writeSession}
        goalType={store.settings.goalType}
        goalValue={store.settings.goalValue}
        gentleNudge={store.settings.gentleNudge}
        aiOn={store.settings.ai.enabled}
        level={store.settings.difficulty}
        onFinish={handleFinish}
        onExit={() => setView("home")}
      />
    );
  }

  const showNav =
    view === "home" ||
    view === "trending" ||
    view === "coach" ||
    view === "progress" ||
    view === "settings";

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
                className={view === "trending" ? "active" : ""}
                onClick={() => setView("trending")}
              >
                Trending
              </button>
              <button
                className={view === "coach" ? "active" : ""}
                onClick={() => setView("coach")}
              >
                Coach
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
      {view === "trending" && <Trending onStartScenario={startScenario} />}
      {view === "coach" && <Coach />}
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
      {(view === "celebrate" || view === "feedback") && !activeEntry && (
        <Home onStart={startWriting} />
      )}
    </div>
  );
}
