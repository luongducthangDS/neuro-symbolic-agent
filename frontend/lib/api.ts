import type { AskResponse, GraphData } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

export async function askQuestion(question: string): Promise<AskResponse> {
  const res = await fetch(`${API_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(120000), // 2 min — LLM on free tier can take 30-60s
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export type ProgressEvent = { node: string; label: string; detail?: { attempt: number; error: string } };
export type StreamCallback = (event: ProgressEvent) => void;

export async function askQuestionStream(
  question: string,
  onProgress: StreamCallback,
): Promise<AskResponse> {
  const res = await fetch(`${API_URL}/ask/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AskResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE frames from buffer
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? ""; // keep incomplete frame

    for (const frame of frames) {
      const lines = frame.trim().split("\n");
      let event = "";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: "))  data  = line.slice(6);
      }
      if (!event || !data) continue;
      try {
        const parsed = JSON.parse(data);
        if (event === "progress") onProgress(parsed as ProgressEvent);
        if (event === "result")   result = parsed as AskResponse;
        if (event === "error")    throw new Error(parsed.message ?? "Stream error");
      } catch (e) {
        if (event === "error") throw e;
        // ignore parse errors on non-critical frames
      }
    }
  }

  if (!result) throw new Error("Stream ended without result");
  return result;
}

export async function fetchGraph(): Promise<GraphData> {
  const res = await fetch(`${API_URL}/graph`);
  if (!res.ok) throw new Error(`Graph fetch error ${res.status}`);
  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
