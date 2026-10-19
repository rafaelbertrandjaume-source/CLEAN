import { useEffect, useRef, useState } from "react";
import { useChat, type ChatItem } from "../agent/chat";
import { useProject } from "../state/store";
import { IconChevron, IconGear, IconPlus, IconSearch, IconSend, IconStop, Spark } from "./icons";

const SUGGESTIONS = [
  "Fais-moi un groove deep house à 122 BPM sur 8 mesures : kick, hats, clap, bassline et accords.",
  "Ajoute une ligne de lead qui répond aux accords, dans la gamme, avec un delay croche pointée.",
  "Analyse le mix et équilibre les niveaux pour garder 1 dB de marge au master.",
  "Comment les producteurs d’éthio-jazz voicent-ils les cuivres ? Applique ça à un pad.",
];

const MODEL_LABELS: Record<string, string> = { "claude-opus-5-5": "Opus 5.5", "claude-sonnet-5-5": "Sonnet 5.5" };

type Block = { kind: "item"; item: ChatItem } | { kind: "changes"; turn: number; tools: Extract<ChatItem, { kind: "tool" }>[] };

// Les appels d'outils consécutifs d'un même tour sont regroupés en une carte « modifications »
function group(items: ChatItem[]): Block[] {
  const out: Block[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (it.kind === "tool" && it.name !== "analyze_mix" && !it.name.startsWith("get_")) {
      if (last?.kind === "changes" && last.turn === it.turn) last.tools.push(it);
      else out.push({ kind: "changes", turn: it.turn, tools: [it] });
    } else {
      out.push({ kind: "item", item: it });
    }
  }
  return out;
}

export function ChatPanel() {
  const { items, busy, send, stop, reset, settings, draft, setDraft, turn } = useChat();
  const [showSettings, setShowSettings] = useState(!settings.apiKey && settings.provider === "anthropic");
  const listRef = useRef<HTMLDivElement>(null);
  const project = useProject((s) => s.project);
  const trackId = useProject((s) => s.selectedTrackId);
  const clipId = useProject((s) => s.selectedClipId);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items]);

  const submit = () => {
    if (!draft.trim() || busy) return;
    void send(draft.trim());
    setDraft("");
  };

  const track = project.tracks.find((t) => t.id === trackId);
  const clip = track?.clips.find((c) => c.id === clipId);
  const blocks = group(items);
  const modelLabel = settings.provider === "anthropic" ? `${MODEL_LABELS[settings.model] ?? settings.model} · ${settings.effort}${settings.webSearch ? " · web" : ""}` : `local · ${settings.localModel || "LM Studio"}`;

  return (
    <aside className="chat" aria-label="Agent">
      <div className="chat-header">
        <Spark size={14} />
        <span style={{ fontWeight: 600 }}>Co-producteur</span>
        <span className="model">{modelLabel}</span>
        <span className="spacer" />
        <button aria-label="Nouvelle conversation" title="Nouvelle conversation" onClick={reset} disabled={busy}>
          <IconPlus />
        </button>
        <button aria-label="Réglages" title="Réglages" aria-expanded={showSettings} className={showSettings ? "on" : ""} onClick={() => setShowSettings((v) => !v)}>
          <IconGear />
        </button>
      </div>

      {showSettings && <SettingsForm />}

      <div className="thread" ref={listRef}>
        {items.length === 0 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setDraft(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {blocks.map((b) =>
          b.kind === "changes" ? <Changes key={b.tools[0].id} tools={b.tools} isLast={b.turn === turn} /> : <Item key={b.item.id} item={b.item} />,
        )}
        {busy && (
          <div className="working">
            <Spark size={12} />
            L’agent travaille…
          </div>
        )}
      </div>

      <div className="composer">
        {(track || project.loop.enabled) && (
          <div className="chips" aria-label="Contexte transmis à l’agent">
            {track && (
              <span>
                Contexte : {track.name}
                {clip ? ` / ${clip.name}` : ""}
              </span>
            )}
            {project.loop.enabled && (
              <span>
                Boucle {project.loop.startBar + 1}–{project.loop.endBar}
              </span>
            )}
          </div>
        )}
        <div className="composer-row">
          <label style={{ flex: 1, display: "flex" }}>
            <span className="sr-only">Message à l’agent</span>
            <textarea
              value={draft}
              placeholder="Décris ce que tu veux entendre…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </label>
          {busy ? (
            <button className="send stop" aria-label="Arrêter" onClick={stop}>
              <IconStop />
            </button>
          ) : (
            <button className="send" aria-label="Envoyer" onClick={submit} disabled={!draft.trim()}>
              <IconSend />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function Changes({ tools, isLast }: { tools: Extract<ChatItem, { kind: "tool" }>[]; isLast: boolean }) {
  const { busy, afterTurn, undoTurn } = useChat();
  const project = useProject((s) => s.project);
  const canUndo = isLast && !busy && afterTurn !== null && afterTurn === project;
  const n = tools.filter((t) => t.status === "ok").length;
  return (
    <div className="changes">
      <div className="changes-head">
        <span className="caps">
          {n} modification{n > 1 ? "s" : ""}
        </span>
        {canUndo && <button onClick={undoTurn}>Annuler le tour</button>}
      </div>
      {tools.map((t) => (
        <div key={t.id} className="change">
          <span className={`dot ${t.status}`} />
          <span className="tool">{t.name}</span>
          <span className={`what ${t.status === "error" ? "error" : ""}`} title={t.detail}>
            {t.status === "running" ? "en cours…" : (t.detail ?? "ok")}
          </span>
        </div>
      ))}
    </div>
  );
}

interface Analysis {
  range_bars: [number, number];
  master: { peakDb: number; rmsDb: number };
  tracks: { track_id: string; name: string; peakDb: number; rmsDb: number }[];
}

function Levels({ data }: { data: Analysis }) {
  const colors = new Map(useProject.getState().project.tracks.map((t) => [t.id, t.color]));
  const pos = (db: number) => `${Math.max(0, Math.min(100, ((db + 48) / 48) * 100))}%`;
  const num = (db: unknown) => (typeof db === "number" && db > -120 ? db.toFixed(1) : "-∞");
  const rows = [{ name: "Master", color: "var(--text)", ...data.master }, ...data.tracks.map((t) => ({ ...t, color: colors.get(t.track_id) ?? "var(--muted)" }))];
  return (
    <div className="card levels">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="caps">Mesure du mix · mes. {data.range_bars[0] + 1}–{data.range_bars[1]}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          crête / RMS
        </span>
      </div>
      {rows.map((r) => (
        <div className="lvl" key={"track_id" in r ? r.track_id : "master"}>
          <span>{r.name}</span>
          <div className="track">
            <div className="rms" style={{ width: pos(r.rmsDb), background: r.color }} />
            <div className="peak" style={{ left: pos(r.peakDb), background: r.color }} />
          </div>
          <span className="num">
            {num(r.peakDb)} / {num(r.rmsDb)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Item({ item }: { item: ChatItem }) {
  const [open, setOpen] = useState(false);
  switch (item.kind) {
    case "user":
      return <div className="bubble">{item.text}</div>;
    case "assistant":
      return item.text ? <div className="answer">{item.text}</div> : null;
    case "thinking": {
      const secs = item.endedAt ? Math.max(1, Math.round((item.endedAt - item.startedAt) / 1000)) : null;
      return (
        <div className="thinking">
          <button aria-expanded={open} onClick={() => setOpen((v) => !v)} disabled={!item.text}>
            <IconChevron open={open} />
            {secs ? `Réflexion · ${secs} s` : "Réflexion…"}
          </button>
          {open && item.text && <p>{item.text}</p>}
        </div>
      );
    }
    case "tool":
      // analyze_mix et lectures (get_*) : hors de la carte des modifications
      if (item.name === "analyze_mix" && item.data) return <Levels data={item.data as Analysis} />;
      return (
        <div className="change" style={{ padding: 0, color: "var(--muted)" }}>
          <span className={`dot ${item.status}`} />
          <span className="tool">{item.name}</span>
          {item.status === "error" && <span className="what error">{item.detail}</span>}
        </div>
      );
    case "search":
      return (
        <div className="card">
          <span className="q">
            <IconSearch />« {item.query} »
          </span>
          {item.results.slice(0, 4).map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noreferrer">
              {hostname(r.url)} — {r.title}
            </a>
          ))}
        </div>
      );
    case "error":
      return <div className="error-box">{item.text}</div>;
  }
}

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function SettingsForm() {
  const { settings, saveSettings } = useChat();
  return (
    <div className="settings">
      <div className="segmented" role="tablist" aria-label="Fournisseur">
        <button role="tab" aria-selected={settings.provider === "anthropic"} onClick={() => saveSettings({ provider: "anthropic" })}>
          Claude
        </button>
        <button role="tab" aria-selected={settings.provider === "local"} onClick={() => saveSettings({ provider: "local" })}>
          Local (LM Studio)
        </button>
      </div>
      {settings.provider === "anthropic" ? (
        <>
          <label>
            Clé API
            <input type="password" value={settings.apiKey} placeholder="sk-ant-…" onChange={(e) => saveSettings({ apiKey: e.target.value })} />
          </label>
          <div className="two">
            <label>
              Modèle
              <select value={settings.model} onChange={(e) => saveSettings({ model: e.target.value })}>
                <option value="claude-opus-5-5">Opus 5.5</option>
                <option value="claude-sonnet-5-5">Sonnet 5.5</option>
              </select>
            </label>
            <label>
              Effort
              <select value={settings.effort} onChange={(e) => saveSettings({ effort: e.target.value as typeof settings.effort })}>
                {["low", "medium", "high", "xhigh", "max"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.webSearch} onChange={(e) => saveSettings({ webSearch: e.target.checked })} />
            Recherche web
          </label>
          <p className="settings-hint">La clé reste sur cette machine.</p>
        </>
      ) : (
        <>
          <label>
            URL du serveur
            <input value={settings.localUrl} onChange={(e) => saveSettings({ localUrl: e.target.value })} />
          </label>
          <label>
            Modèle
            <input value={settings.localModel} placeholder="identifiant LM Studio" onChange={(e) => saveSettings({ localModel: e.target.value })} />
          </label>
          <p className="settings-hint">Démarre le serveur dans LM Studio (onglet Developer). Pas de recherche web en local.</p>
        </>
      )}
    </div>
  );
}
