import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { t } from "../i18n";
import { Icon, type IconName } from "./ui";
import { getDbMode } from "../lib/db";

/**
 * Command palette (Ctrl/Cmd+K): fuzzy-jump between conversations and
 * fire common actions without leaving the keyboard. The sidebar search
 * box focus shortcut used to live here; this is its grown-up form.
 */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const convos = useStore((s) => s.convos);
  const agents = useStore((s) => s.agents);
  const settings = useStore((s) => s.settings);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  type Item = { id: string; label: string; hint: string; icon: IconName; run: () => void };
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const store = useStore.getState();
    // actions
    const acts: Item[] = [
      { id: "act:new", label: t("newAgentBtn"), hint: "ACTION", icon: "plus", run: () => { store.setSidebar(false); void store.createAgent(); } },
      { id: "act:settings", label: t("settingsTitle"), hint: "ACTION", icon: "settings", run: () => store.setView("settings") },
      { id: "act:memory", label: t("memoryTitle"), hint: "ACTION", icon: "memory", run: () => store.setView("memory") },
      {
        id: "act:theme",
        label: settings.themeMode === "dark" ? t("lightMode") : t("darkMode"),
        hint: "ACTION",
        icon: "settings",
        run: () => store.setSettings({ themeMode: settings.themeMode === "dark" ? "light" : "dark" }),
      },
    ];
    if (getDbMode() !== "remote") out.push(...acts);
    else out.push(...acts); // same set for now; remote-specific items can join later
    // conversations
    const ql = q.trim().toLowerCase();
    for (const c of convos.slice(0, 40)) {
      if (c.archived) continue;
      const agent = agents.find((a) => a.id === c.agentId);
      const label = c.title && c.title !== t("newChat") ? `${agent?.name ?? "?"} · ${c.title}` : agent?.name ?? c.title;
      if (ql && !label.toLowerCase().includes(ql)) continue;
      out.push({
        id: c.id,
        label,
        hint: (c.lastMessage || "").slice(0, 40),
        icon: c.kind === "group" ? "chat" : "chat",
        run: () => void store.openConversation(c.id),
      });
    }
    return out;
  }, [convos, agents, q, settings.themeMode]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return items;
    return items.filter((i) => i.label.toLowerCase().includes(ql) || i.hint.toLowerCase().includes(ql));
  }, [items, q]);

  useEffect(() => setIdx(0), [q]);

  const run = (i: Item) => {
    onClose();
    i.run();
  };

  return (
    <div className="cp-mask" onClick={onClose}>
      <div className="cp" onClick={(e) => e.stopPropagation()}>
        <div className="cp-head">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("cpPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => (i + 1) % Math.max(filtered.length, 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1)); }
              else if (e.key === "Enter") { e.preventDefault(); filtered[idx] && run(filtered[idx]); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
          />
          <span className="cp-esc">ESC</span>
        </div>
        <div className="cp-list">
          {filtered.length === 0 && <div className="cp-empty">{t("cpEmpty")}</div>}
          {filtered.map((it, i) => (
            <button key={it.id} className={`cp-item ${i === idx ? "on" : ""}`} onClick={() => run(it)}
              onMouseEnter={() => setIdx(i)}>
              <Icon name={it.icon} size={15} />
              <span className="cp-label">{it.label}</span>
              {it.hint && <span className="cp-hint">{it.hint}</span>}
            </button>
          ))}
        </div>
        <div className="cp-foot">
          <span>↑↓ {t("cpNavigate")}</span>
          <span>↵ {t("cpOpen")}</span>
        </div>
      </div>
    </div>
  );
}
