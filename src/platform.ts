// Intégration au viewer claude.ai quand l'app tourne comme Artifact publié :
// l'agent passe par la capacité `sample` (compte Claude du viewer, sans clé API)
// et les fichiers par `downloads` (les liens <a download> y sont bloqués).

export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  execute: (input: Record<string, unknown>, ctx: { signal: AbortSignal }) => unknown;
}
export interface SampleError {
  code: string;
  message: string;
  text?: string;
}
type Turn = { role: "user" | "assistant"; content: string };
export interface Sample {
  (
    input: string | Turn[],
    opts?: {
      onText?: (u: { text: string; delta: string }) => void;
      signal?: AbortSignal;
      tools?: SampleTool[];
      modelTier?: "quick" | "default" | "complex";
      cache?: boolean;
    },
  ): Promise<{ text: string; truncated: boolean; modelTierApplied: string }>;
  limits(): Promise<{ maxPromptBytes: number; tools?: { maxCount: number } }>;
}
interface Downloads {
  save(req: { filename: string; data: Blob | string }): Promise<{ status: string }>;
}

type Runtime = { use(name: string): Promise<unknown> };
const runtime = (window as unknown as { claude?: Runtime }).claude;

// Vrai dans un viewer claude.ai (la promesse de use() peut encore résoudre null)
export const inClaudeViewer = typeof runtime?.use === "function";

export const getSample = async (): Promise<Sample | null> => (inClaudeViewer ? ((await runtime!.use("sample")) as Sample | null) : null);

export async function saveFile(blob: Blob, filename: string): Promise<void> {
  const downloads = inClaudeViewer ? ((await runtime!.use("downloads")) as Downloads | null) : null;
  if (downloads) {
    await downloads.save({ filename, data: blob });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
