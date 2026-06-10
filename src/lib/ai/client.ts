interface OpenRouterOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const AI_MODEL = "deepseek/deepseek-v4-pro";
export const AI_MAX_TOKENS = 1024;

export async function createChatCompletionStream(
  opts: OpenRouterOptions,
  messages: ChatMessage[]
): Promise<{ stream?: ReadableStream<Uint8Array>; error?: string }> {
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        stream: true,
        max_tokens: opts.maxTokens ?? AI_MAX_TOKENS,
      }),
      signal: opts.signal,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }

  if (!res.ok || !res.body) {
    return { error: `OpenRouter error: HTTP ${res.status}` };
  }

  return { stream: reframeAsPlainText(res.body) };
}

// OpenRouter streams Server-Sent Events (`data: {...}` lines, terminated by
// `data: [DONE]`). Re-frame as plain UTF-8 text deltas so the API route and
// client can stay completely unaware of the provider's wire format.
function reframeAsPlainText(
  sseBody: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      if (buffer.includes("data: [DONE]")) {
        controller.terminate();
        return;
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();

        if (payload === "[DONE]") {
          controller.terminate();
          return;
        }

        try {
          const json = JSON.parse(payload);
          if (json.error) {
            // Log internally but never expose provider error text to the client
            const errDetail =
              typeof json.error === "string"
                ? json.error
                : json.error.message || JSON.stringify(json.error);
            console.error("[AI] Upstream provider error:", errDetail);
            controller.enqueue(
              encoder.encode(
                "\n[The assistant ran into a problem. Please try again.]"
              )
            );
            controller.terminate();
            return;
          }

          const delta: string | undefined = json.choices?.[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        } catch {
          // Ignore partial/malformed JSON lines
        }
      }
    },
    flush(controller) {
      if (buffer.includes("data: [DONE]")) {
        return;
      }
      if (buffer.trim()) {
        controller.enqueue(encoder.encode(buffer));
      }
    },
  });

  return sseBody.pipeThrough(transformStream);
}
