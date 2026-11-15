import { useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import { setLanguage } from "./i18n";
import { useStore, applyTheme } from "./store";
import Rail from "./components/Rail";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import MemoryView from "./components/MemoryView";
import SettingsView from "./components/SettingsView";
import AgentEditor from "./components/AgentEditor";
import TitleBar from "./components/TitleBar";
import CommandPalette from "./components/CommandPalette";
import LoginView from "./components/LoginView";
import { ConfirmHost, Icon, Tip, TipFor, type IconName } from "./components/ui";
import { t, tf } from "./i18n";
import type { Dict } from "./i18n/zh-CN";
import { listRemoteModels, friendlyError } from "@myosotis/core";
import type { Protocol } from "@myosotis/core";
import { TEMPLATE_GROUPS } from "./components/SettingsView";
import { fetchMe } from "./lib/auth";
import { getDbMode, setDbMode, isHubHosted } from "./lib/db";

export default function App() {
  const [palette, setPalette] = useState(false);
  const ready = useStore((s) => s.ready);
  const view = useStore((s) => s.view);
  const settings = useStore((s) => s.settings);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  // subscribed here so the tab badge / document title react to live unread events
  const convos = useStore((s) => s.convos);
  const init = useStore((s) => s.init);
  // First-run gate: snapshot once on mount. Onboarding's own provider
  // setup mutates `providers`; a live selector would flip this gate and
  // unmount the wizard mid-setup (the wizard kills itself the moment
  // its "connect" button succeeds).
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  useEffect(() => {
    if (!ready || firstRun !== null) return;
    setFirstRun(!settings.onboardingDone && useStore.getState().providers.length === 0 && getDbMode() !== "remote");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, firstRun]);
  // hub mode gate: null = deciding, false = show login, true = session ok
  const [hubAuthed, setHubAuthed] = useState<boolean | null>(null);

  // decide the gate before any data loading
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hubHosted = await isHubHosted();
      if (cancelled) return;
      if (!hubHosted) {
        setHubAuthed(true); // pure local app, no gate
        return;
      }
      try {
        await fetchMe();
        if (!cancelled) setHubAuthed(true);
      } catch {
        if (!cancelled) setHubAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // kicked out mid-session (session expired / logged out elsewhere)
  useEffect(() => {
    const onUnauth = async () => {
      if (getDbMode() !== "remote") return;
      setHubAuthed(false);
      useStore.setState({ ready: false });
    };
    window.addEventListener("myo:unauthorized", onUnauth);
    return () => window.removeEventListener("myo:unauthorized", onUnauth);
  }, []);

  useEffect(() => {
    if (hubAuthed) init();
  }, [init, hubAuthed]);

  useEffect(() => {
    applyTheme(settings);
  }, [settings.themeId, settings.themeMode, settings]);

  // offline / reconnect state for the connection banner
  useEffect(() => {
    const goOffline = () => useStore.setState({ connState: "offline" });
    const goOnline = () => {
      // remote mode: live.ts will reconnect and flip to "ok"; until then show reconnecting
      if (useStore.getState().connState === "offline") {
        useStore.setState({ connState: "reconnecting" });
      }
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // browser tab badge: total unread count, like mainstream chat apps
  useEffect(() => {
    const unread = convos.reduce((n, c) => n + (c.unread ?? 0), 0);
    try {
      (navigator as any).setAppBadge?.(unread > 0 ? unread : 0);
      if (unread === 0) (navigator as any).clearAppBadge?.();
    } catch {}
    document.title = unread > 0 ? `(${unread}) Myosotis` : "Myosotis";
  }, [convos]);

  // message font size as CSS var + i18n language sync + bubble style
  useEffect(() => {
    document.documentElement.style.setProperty("--msg-font", (settings.fontSize ?? 15) + "px");
    document.documentElement.dataset.bubble = settings.bubbleStyle ?? "modern";
    setLanguage(settings.language ?? "zh-CN");
  }, [settings.fontSize, settings.language, settings.bubbleStyle]);

  // global shortcuts: Ctrl/Cmd+K command palette, Ctrl/Cmd+F in-chat search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        // chat view only: focus the in-conversation search bar
        const inChat = useStore.getState().view === "chat";
        if (!inChat) return;
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".msg-search input")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // edge-swipe back: drag from the left edge to reopen the conversation list
  useEffect(() => {
    if (!("ontouchstart" in window)) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = startX < 28;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      // horizontal swipe to the right, long enough, mostly horizontal
      if (dx > 70 && Math.abs(dy) < 50) {
        const st = useStore.getState();
        if (!st.sidebarOpen) st.setSidebar(true);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  // Android back gesture (and browser back): close overlays one by one
  useEffect(() => {
    const push = () => history.pushState({ myosotis: 1 }, "");
    push(); // sentinel
    const onPop = () => {
      const s = useStore.getState();
      if (s.confirmOptions) {
        s.resolveConfirm(false);
        push();
      } else if (s.editingAgentId) {
        s.setEditingAgentId(null);
        push();
      } else if (s.sidebarOpen) {
        s.setSidebar(false);
        push();
      }
      // nothing open: allow default behavior (app exit on Android)
    };
    window.addEventListener("popstate", onPop);    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const dark =
    settings.themeMode === "dark" ||
    (settings.themeMode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);

  // auto mode: follow live OS theme switches (was read once at mount)
  useEffect(() => {
    if (settings.themeMode !== "auto") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(useStore.getState().settings);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.themeMode]);

  if (hubAuthed === null || (!ready && hubAuthed !== false)) {
    if (hubAuthed === null) {
      return (
        <div className="splash">
          <img src="logo.png" alt="" />
          <div>Myosotis</div>
        </div>
      );
    }
  }

  if (hubAuthed === false) {
    return (
      <>
        <LoginView
          onLoggedIn={() => {
            useStore.setState({ ready: false });
            setHubAuthed(true);
          }}
        />
        <Toaster position="top-center" />
      </>
    );
  }

  if (!ready) {
    return (
      <div className="splash">
        <img src="logo.png" alt="" />
        <div>Myosotis</div>
      </div>
    );
  }

  if (settings.onboardingDone) {
    // wizard finished (or veteran user): fall through to the app
  } else if (firstRun) {
    return <Onboarding />;
  }
  return (
    <Tip.Provider delayDuration={350}>
      <div className="app-root">
        <TitleBar />
      <div className={`app ${view !== "chat" ? "no-sidebar" : ""}`} key={settings.language}>
        <Rail />
        <Sidebar />
        {sidebarOpen && <div className="sidebar-mask" onClick={() => useStore.getState().setSidebar(false)} />}
          <main className="main" data-wallpaper={settings.wallpaper} key={view}>
            {view === "chat" && <ChatView />}
            {view === "memory" && <MemoryView />}
            {view === "settings" && <SettingsView />}
          </main>
          <AgentEditor />
          {palette && <CommandPalette onClose={() => setPalette(false)} />}
          <TabBar />
          <ConfirmHostBridge />
        </div>
        <Toaster
          position="top-center"
          theme={dark ? "dark" : "light"}
          toastOptions={{
            style: {
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-lg)",
              borderRadius: "8px",
              fontSize: "13px",
            },
          }}
        />
      </div>
    </Tip.Provider>
  );
}

// ----------------------------------------------------------------
// Confirm dialog host (driven by store.askConfirm)
// ----------------------------------------------------------------
function ConfirmHostBridge() {
  const options = useStore((s) => s.confirmOptions);
  const resolve = useStore((s) => s.resolveConfirm);
  return <ConfirmHost options={options} onResolve={resolve} />;
}

// ----------------------------------------------------------------
// Mobile bottom tab bar (hidden on desktop via CSS)
// ----------------------------------------------------------------
const TABS: { view: string; icon: IconName; labelKey: "navChat" | "navMemory" | "navSettings" }[] = [
  { view: "chat", icon: "chat", labelKey: "navChat" },
  { view: "memory", icon: "memory", labelKey: "navMemory" },
  { view: "settings", icon: "settings", labelKey: "navSettings" },
];

function TabBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const setSidebar = useStore((s) => s.setSidebar);
  // subscribe so the unread dot reacts to live events
  const convos = useStore((s) => s.convos);
  const unread = convos.reduce((n, c) => n + (c.unread ?? 0), 0);  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <button
          key={tab.view}
          className={`nav-item ${view === tab.view ? "active" : ""}`}
          onClick={() => {
            setView(tab.view as any);
            if (tab.view === "chat") setSidebar(true); // mobile: show conversation list
          }}
        >
          <Icon name={tab.icon} />
          {t(tab.labelKey)}
          {tab.view === "chat" && unread > 0 && <span className="tab-dot" />}
        </button>
      ))}
    </nav>
  );
}

// ----------------------------------------------------------------
// First-launch welcome
// ----------------------------------------------------------------
/**
 * First-run wizard. Step 0 configures a real provider (pick a template,
 * paste the key, fetch models live); step 1 names your first agent and
 * lands you in a working chat. "Skip" always remains one click away.
 */
function Onboarding() {
  const setSettings = useStore((s) => s.setSettings);
  const setView = useStore((s) => s.setView);
  const providers = useStore((s) => s.providers);
  const models = useStore((s) => s.models);
  const [step, setStep] = useState<0 | 1 | 2>(providers.length > 0 ? 1 : 0);

  const finish = (go: "settings" | "chat") => {
    setSettings({ onboardingDone: true });
    setView(go);
  };

  return (
    <div className="app">
      <main className="main">
        <div className="onboard">
          <div className="onboard-card" style={{ maxWidth: step === 0 ? 520 : 460 }}>
            <img className="logo" src="logo.png" alt="Myosotis" />
            <h1>{t("obTitle")}</h1>
            <div className="ob-progress" aria-hidden>
              {[0, 1].map((i) => (
                <span key={i} className={i <= step ? "on" : ""} />
              ))}
            </div>
            {step === 0 ? (
              <>
                <div className="sub">
                  {t("obSlogan")}
                  <br />
                  {t("obSub")}
                </div>
                <OnboardProviderStep onNext={() => setStep(1)} onSkip={() => finish("chat")} />
              </>
            ) : (
              <OnboardAgentStep
                providersCount={providers.length}
                modelsCount={models.length}
                onDone={() => finish("chat")}
                onBack={() => setStep(0)}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Step 0 — provider quick setup, reusing the settings-page machinery. */
function OnboardProviderStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const addProvider = useStore((s) => s.addProvider);
  const addModels = useStore((s) => s.addModels);
  const showToast = useStore((s) => s.showToast);
  const [protocol, setProtocol] = useState<Protocol>("openai");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [remote, setRemote] = useState<{ id: string; label: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const createdProviderId = useRef<string>("");
  const placeholder = protocol === "openai" ? "https://api.openai.com/v1" : protocol === "anthropic" ? "https://api.anthropic.com" : "https://generativelanguage.googleapis.com";

  const applyTemplate = (tpl: { name: string; protocol: Protocol; baseUrl: string }) => {
    setProtocol(tpl.protocol);
    setBaseUrl(tpl.baseUrl);
    if (!name.trim()) setName(tpl.name);
  };

  const connect = async () => {
    if (!apiKey.trim() || !baseUrl.trim()) {
      showToast(t("obNeedKeyUrl"), "error");
      return;
    }
    setLoading(true);
    try {
      const p = await addProvider({
        name: name.trim() || t("customProvider"),
        protocol,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        keys: [],
      });
      createdProviderId.current = p.id;
      const list = await listRemoteModels(p);
      setRemote(list);
      setPicked(new Set());
      showToast(tf("fetchOk", { n: list.length }), "success");
    } catch (e) {
      showToast(`${friendlyError(e)}\n${t("savedCanManual")}`, "error");
      setRemote([]);
    } finally {
      setLoading(false);
    }
  };

  const togglePickOb = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const confirmModels = async () => {
    const p = useStore.getState().providers.find((x) => x.id === createdProviderId.current);
    if (!p) return;
    const ids = picked.size ? Array.from(picked) : remote?.slice(0, 3).map((m) => m.id) ?? [];
    if (ids.length) await addModels(p.id, ids, []);
    onNext();
  };

  return (
    <div className="ob-form">
      <div className="field">
        <label>{t("quickPick")}</label>
        <div className="chips">
          {TEMPLATE_GROUPS.flatMap((g) => g.items).map((tpl) => (
            <button key={tpl.name} className={`chip ${baseUrl === tpl.baseUrl ? "on" : ""}`} onClick={() => applyTemplate(tpl)}>
              {tpl.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>{t("apiKey")}</label>
        <input
          className="input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label>{t("baseUrl")}</label>
        <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={placeholder} />
      </div>
      {remote === null ? (
        <>
          <button className="btn primary" style={{ width: "100%" }} onClick={connect} disabled={loading}>
            {loading ? t("connecting") : t("obConnect")}
          </button>
          <button className="btn ghost" style={{ width: "100%", marginTop: 10 }} onClick={onSkip}>
            {t("obBrowse")}
          </button>
        </>
      ) : (
        <>
          <div className="ob-models">
            {remote.length === 0 ? (
              <div className="ob-models-empty">{t("noModelsFound")}</div>
            ) : (
              remote.slice(0, 24).map((m) => (
                <div key={m.id} className="remote-item" onClick={() => togglePickOb(m.id)}>
                  <div className={`checkbox ${picked.has(m.id) ? "on" : ""}`}>{picked.has(m.id) && "✓"}</div>
                  <div className="name" title={m.id}>
                    {m.label}
                  </div>
                </div>
              ))
            )}
          </div>
          <button className="btn primary" style={{ width: "100%" }} onClick={confirmModels} disabled={loading}>
            {t("obNextAgent")}
          </button>
        </>
      )}
    </div>
  );
}

// inside OnboardProviderStep

/** Step 1 — name the first agent and drop the user into a live chat. */
function OnboardAgentStep({
  providersCount,
  modelsCount,
  onDone,
  onBack,
}: {
  providersCount: number;
  modelsCount: number;
  onDone: () => void;
  onBack: () => void;
}) {
  const createAgent = useStore((s) => s.createAgent);
  const updateAgent = useStore((s) => s.updateAgent);
  const openOrCreate = useStore((s) => s.openOrCreateConversation);
  const setEditingAgentId = useStore((s) => s.setEditingAgentId);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = providersCount > 0 && modelsCount > 0;

  const start = async () => {
    setBusy(true);
    try {
      const agent = await createAgent();
      const n = name.trim();
      if (n) await updateAgent(agent.id, { name: n });
      setEditingAgentId(null);
      await openOrCreate(agent.id);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="sub">{ready ? t("ob2Ready") : t("ob2NoModels")}</div>
      <div className="field" style={{ textAlign: "left" }}>
        <label>{t("ob2Name")}</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("ob2NamePh")}
          maxLength={24}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void start();
          }}
        />
      </div>
      <button className="btn primary" style={{ width: "100%", padding: "13px" }} onClick={start} disabled={busy}>
        {t("ob2Start")}
      </button>
      <button className="btn ghost" style={{ width: "100%", marginTop: 10 }} onClick={onBack}>
        {t("ob2Back")}
      </button>
    </>
  );
}
