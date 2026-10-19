import { useEffect, useRef, useState } from "react";
import { useChat, type ChatItem } from "../agent/chat";

const SUGGESTIONS = [
  "Fais-moi un groove deep house à 122 BPM sur 8 mesures : kick, hats, clap, bassline et accords.",
  "Ajoute une ligne de lead qui répond aux accords, dans la gamme, avec un delay croche pointée.",
  "Analyse le mix et équilibre les niveaux pour garder 1 dB de marge au master.",
  "Comment les producteurs d'éthio-jazz voicent-ils les cuivres ? Applique ça à un pad.",
];

export function ChatPanel() {
  const { items, busy, send, stop, reset, settings } = useChat();
  const [text, setText] = useState("");
  const [showSettings, setShowSettings] = useState(!settings.apiKey && settings.provider === "anthropic");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items]);

  const submit = () => {
    if (!text.trim() || busy) return;
    void send(text.trim());
    setText("");
  };

  return (
    <aside className="chat">
      <div className="chat-header">
        <span>
          Agent · {settings.provider === "anthropic" ? settings.model : `local ${settings.localModel || ""}`}
        </span>
        <span>
          <button title="Nouvelle conversation" onClick={reset} disabled={busy}>
            ⟳
          </button>
          <button title="Réglages" className={showSettings ? "on" : ""} onClick={() => setShowSettings((v) => !v)}>
            ⚙
          </button>
        </span>
      </div>

      {showSettings && <SettingsForm />}

      <div className="chat-list" ref={listRef}>
        {items.length === 0 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setText(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {items.map((it) => (
          <Item key={it.id} item={it} />
        ))}
        {busy && <div className="working">…</div>}
      </div>

      <div className="chat-input">
        <textarea
          value={text}
          placeholder="Décris ce que tu veux entendre…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <button onClick={stop}>Stop</button>
        ) : (
          <button onClick={submit} disabled={!text.trim()}>
            Envoyer
          </button>
        )}
      </div>
    </aside>
  );
}

function Item({ item }: { item: ChatItem }) {
  const [open, setOpen] = useState(false);
  switch (item.kind) {
    case "user":
      return <div className="msg user">{item.text}</div>;
    case "assistant":
      return item.text ? <div className="msg assistant">{item.text}</div> : null;
    case "thinking":
      return item.text ? (
        <div className="thinking" onClick={() => setOpen((v) => !v)}>
          {open ? item.text : "Réflexion…"}
        </div>
      ) : null;
    case "tool":
      return (
        <div className={`tool ${item.status}`}>
          <code>{item.name}</code>
          {item.detail && <span> · {item.detail}</span>}
        </div>
      );
    case "search":
      return (
        <div className="search">
          🔎 {item.query}
          {item.results.length > 0 && (
            <ul>
              {item.results.slice(0, 5).map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case "error":
      return <div className="msg error">{item.text}</div>;
  }
}

function SettingsForm() {
  const { settings, saveSettings } = useChat();
  return (
    <div className="settings">
      <label>
        Fournisseur
        <select value={settings.provider} onChange={(e) => saveSettings({ provider: e.target.value as "anthropic" | "local" })}>
          <option value="anthropic">Claude (API Anthropic)</option>
          <option value="local">Local (LM Studio, compatible OpenAI)</option>
        </select>
      </label>
      {settings.provider === "anthropic" ? (
        <>
          <label>
            Clé API
            <input type="password" value={settings.apiKey} placeholder="sk-ant-…" onChange={(e) => saveSettings({ apiKey: e.target.value })} />
          </label>
          <label>
            Modèle
            <select value={settings.model} onChange={(e) => saveSettings({ model: e.target.value })}>
              <option value="claude-opus-5-5">Claude Opus 5.5</option>
              <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
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
          <label className="check">
            <input type="checkbox" checked={settings.webSearch} onChange={(e) => saveSettings({ webSearch: e.target.checked })} />
            Recherche web
          </label>
          <p className="settings-hint">La clé est stockée localement dans cette app, jamais ailleurs.</p>
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
