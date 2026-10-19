// État du chat et boucle agentique. Deux fournisseurs :
// - Anthropic (Claude) : streaming, réflexion adaptative, recherche web côté serveur ;
// - local (LM Studio, API compatible OpenAI) : pour travailler hors ligne, en non-streaming.

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { create } from "zustand";
import { projectNow, useProject } from "../state/store";
import { SYSTEM_PROMPT } from "./prompt";
import { TOOL_DEFS, projectBrief, runTool } from "./tools";

export type ChatItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "thinking"; text: string }
  | { id: string; kind: "tool"; name: string; status: "running" | "ok" | "error"; detail?: string }
  | { id: string; kind: "search"; query: string; results: { title: string; url: string }[] }
  | { id: string; kind: "error"; text: string };

export interface Settings {
  provider: "anthropic" | "local";
  apiKey: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  webSearch: boolean;
  localUrl: string;
  localModel: string;
}

const SETTINGS_KEY = "clean.settings";
const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  apiKey: "",
  model: "claude-opus-5-5",
  effort: "high",
  webSearch: true,
  localUrl: "http://localhost:1234/v1",
  localModel: "",
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* stockage indisponible : valeurs par défaut */
  }
  return { ...DEFAULT_SETTINGS };
}

interface LocalMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface ChatStore {
  settings: Settings;
  items: ChatItem[];
  busy: boolean;
  abort: AbortController | null;
  anthropicHistory: BetaMessageParam[];
  localHistory: LocalMessage[];
  saveSettings: (s: Partial<Settings>) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

let seq = 0;
const nid = () => `i${++seq}`;
const MAX_TURNS = 40;

export const useChat = create<ChatStore>((set, get) => {
  const push = (item: ChatItem) => set((s) => ({ items: [...s.items, item] }));
  const patch = (id: string, fn: (it: ChatItem) => ChatItem) =>
    set((s) => ({ items: s.items.map((it) => (it.id === id ? fn(it) : it)) }));

  async function execTool(itemId: string, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
    try {
      if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Entrée d'outil invalide (objet JSON attendu)");
      const result = await runTool(name, input as Record<string, unknown>);
      patch(itemId, (it) => ({ ...it, status: "ok", detail: summarize(name, input as Record<string, unknown>) }) as ChatItem);
      return { content: result, isError: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patch(itemId, (it) => ({ ...it, status: "error", detail: msg }) as ChatItem);
      return { content: msg, isError: true };
    }
  }

  async function runAnthropic(userText: string, signal: AbortSignal) {
    const { settings } = get();
    if (!settings.apiKey) throw new Error("Clé API Anthropic manquante : ouvre les réglages (⚙).");
    // Application de bureau locale : la clé reste sur la machine de l'utilisateur.
    const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });

    const tools: BetaToolUnion[] = TOOL_DEFS.map((t) => ({ ...t, eager_input_streaming: true }));
    if (settings.webSearch) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 5 });

    const history = [...get().anthropicHistory];
    history.push({
      role: "user",
      content: [
        { type: "text", text: userText },
        { type: "text", text: `<project_state>\n${projectBrief(projectNow())}\n</project_state>` },
      ],
    });
    set({ anthropicHistory: history });

    let jsonRetries = 0;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const blockItems = new Map<number, string>();
      const stream = client.beta.messages.stream(
        {
          model: settings.model,
          max_tokens: 64000,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: settings.effort },
          cache_control: { type: "ephemeral" },
          tools,
          messages: history,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal },
      );

      stream.on("streamEvent", (ev) => {
        if (ev.type === "content_block_start") {
          const b = ev.content_block as BetaContentBlock;
          const id = nid();
          if (b.type === "text") push({ id, kind: "assistant", text: "" });
          else if (b.type === "thinking") push({ id, kind: "thinking", text: "" });
          else if (b.type === "tool_use") push({ id, kind: "tool", name: b.name, status: "running" });
          else if (b.type === "server_tool_use" && b.name === "web_search") push({ id, kind: "search", query: "…", results: [] });
          else if (b.type === "web_search_tool_result") {
            const results = Array.isArray(b.content) ? b.content.map((r) => ({ title: r.title, url: r.url })) : [];
            const search = [...get().items].reverse().find((it) => it.kind === "search");
            if (search) patch(search.id, (it) => ({ ...it, results }) as ChatItem);
            return;
          } else return;
          blockItems.set(ev.index, id);
        } else if (ev.type === "content_block_delta") {
          const id = blockItems.get(ev.index);
          if (!id) return;
          if (ev.delta.type === "text_delta") {
            const d = ev.delta.text;
            patch(id, (it) => (it.kind === "assistant" ? { ...it, text: it.text + d } : it));
          } else if (ev.delta.type === "thinking_delta") {
            const d = ev.delta.thinking;
            patch(id, (it) => (it.kind === "thinking" ? { ...it, text: it.text + d } : it));
          }
        }
      });

      let message: BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        // Entrée d'outil JSON illisible (streaming anticipé) : on relance le tour, deux fois max
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        for (const id of blockItems.values()) patch(id, (it) => (it.kind === "tool" ? { ...it, status: "error", detail: "entrée illisible, nouvel essai" } : it));
        continue;
      }

      // Requêtes de recherche : l'entrée n'est complète qu'à la fin du bloc
      message.content.forEach((b, i) => {
        const id = blockItems.get(i);
        if (id && b.type === "server_tool_use") {
          const q = String((b.input as { query?: unknown }).query ?? "");
          patch(id, (it) => (it.kind === "search" ? { ...it, query: q } : it));
        }
      });

      if (message.stop_reason === "refusal") {
        push({ id: nid(), kind: "error", text: "Requête refusée par le modèle." });
        history.push({ role: "assistant", content: message.content });
        break;
      }

      history.push({ role: "assistant", content: message.content });
      set({ anthropicHistory: [...history] });

      if (message.stop_reason === "pause_turn") continue;

      const toolUses = message.content
        .map((b, i) => ({ b, i }))
        .filter((x): x is { b: Extract<BetaContentBlock, { type: "tool_use" }>; i: number } => x.b.type === "tool_use");
      if (toolUses.length === 0) break;

      if (message.stop_reason === "max_tokens") {
        throw new Error("Réponse tronquée (max_tokens) : entrée d'outil incomplète, demande à l'agent de procéder en plusieurs étapes.");
      }

      const results: BetaToolResultBlockParam[] = [];
      for (const { b, i } of toolUses) {
        const itemId = blockItems.get(i) ?? nid();
        const r = await execTool(itemId, b.name, b.input);
        results.push({ type: "tool_result", tool_use_id: b.id, content: r.content, is_error: r.isError });
      }
      history.push({ role: "user", content: results });
      set({ anthropicHistory: [...history] });
      if (signal.aborted) break;
    }
  }

  async function runLocal(userText: string, signal: AbortSignal) {
    const { settings } = get();
    const history = [...get().localHistory];
    if (history.length === 0) history.push({ role: "system", content: SYSTEM_PROMPT });
    history.push({ role: "user", content: `${userText}\n\n<project_state>\n${projectBrief(projectNow())}\n</project_state>` });

    const tools = TOOL_DEFS.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await fetch(`${settings.localUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: settings.localModel || undefined, messages: history, tools, temperature: 0.4 }),
        signal,
      });
      if (!res.ok) throw new Error(`Serveur local : HTTP ${res.status} ${await res.text()}`);
      const data = await res.json();
      const msg = data.choices?.[0]?.message as LocalMessage | undefined;
      if (!msg) throw new Error("Réponse du serveur local sans message");
      history.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
      if (msg.content) push({ id: nid(), kind: "assistant", text: msg.content });
      if (!msg.tool_calls?.length) break;

      for (const call of msg.tool_calls) {
        const id = nid();
        push({ id, kind: "tool", name: call.function.name, status: "running" });
        let input: unknown;
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          input = null;
        }
        const r = await execTool(id, call.function.name, input);
        history.push({ role: "tool", tool_call_id: call.id, content: r.isError ? `ERREUR : ${r.content}` : r.content });
      }
      set({ localHistory: [...history] });
    }
    set({ localHistory: history });
  }

  return {
    settings: loadSettings(),
    items: [],
    busy: false,
    abort: null,
    anthropicHistory: [],
    localHistory: [],

    saveSettings: (s) => {
      const settings = { ...get().settings, ...s };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        /* stockage indisponible : réglages valables pour la session seulement */
      }
      // Changer de fournisseur ou de modèle repart d'une conversation vierge
      const reset = s.provider !== undefined && s.provider !== get().settings.provider;
      set({ settings, ...(reset ? { anthropicHistory: [], localHistory: [] } : {}) });
    },

    send: async (text) => {
      if (get().busy || !text.trim()) return;
      const abort = new AbortController();
      set({ busy: true, abort });
      push({ id: nid(), kind: "user", text });
      // Tout le tour de l'agent = une seule entrée d'annulation
      useProject.getState().beginTransaction();
      try {
        if (get().settings.provider === "anthropic") await runAnthropic(text, abort.signal);
        else await runLocal(text, abort.signal);
      } catch (e) {
        if (!abort.signal.aborted) push({ id: nid(), kind: "error", text: describeError(e) });
        // Historique Anthropic incohérent après une erreur en plein tour : on retire le tour inachevé
        repairHistory();
      } finally {
        useProject.getState().endTransaction();
        set({ busy: false, abort: null });
      }
    },

    stop: () => {
      get().abort?.abort();
      repairHistory();
    },

    reset: () => set({ items: [], anthropicHistory: [], localHistory: [] }),
  };

  // Garantit que l'historique se termine par un tour assistant complet (sans tool_use en attente),
  // sinon la requête suivante serait rejetée.
  function repairHistory() {
    const h = [...get().anthropicHistory];
    while (h.length) {
      const last = h[h.length - 1];
      const pendingTools =
        last.role === "assistant" && Array.isArray(last.content) && last.content.some((b) => b.type === "tool_use");
      if (last.role === "user" || pendingTools) h.pop();
      else break;
    }
    set({ anthropicHistory: h });
  }
});

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Clé API invalide.";
  if (e instanceof Anthropic.RateLimitError) return "Limite de débit atteinte, réessaie dans un instant.";
  if (e instanceof Anthropic.APIConnectionError) return "Connexion à l'API impossible.";
  if (e instanceof Anthropic.APIError) return `Erreur API ${e.status ?? ""} : ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

function summarize(name: string, input: Record<string, unknown>): string | undefined {
  if (Array.isArray(input.notes)) return `${input.notes.length} notes`;
  if (name === "create_track") return `${input.name} (${input.kind}${input.preset ? `/${input.preset}` : ""})`;
  if (name === "add_effect") return String(input.type);
  if (name === "set_song" && input.bpm) return `${input.bpm} BPM`;
  return undefined;
}
