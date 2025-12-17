import type { Env } from "../env";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function streamChat(
  env: Env,
  messages: Message[],
  userId: string
): Promise<ReadableStream> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API key not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      stream: true,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  if (!response.body) {
    throw new Error("No response body from Anthropic API");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = "";

  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          // Process any remaining buffer content before closing
          if (buffer.trim() && buffer.startsWith("data: ")) {
            const data = buffer.slice(6);
            if (data !== "[DONE]") {
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({
                      type: "delta",
                      content: parsed.delta.text,
                    })}\n\n`)
                  );
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
          // Track usage but don't let failures affect the user's chat
          try {
            await trackUsage(env, userId, inputTokens, outputTokens);
          } catch {
            // Silently ignore analytics failures
          }
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({
                    type: "delta",
                    content: parsed.delta.text,
                  })}\n\n`)
                );
              } else if (parsed.type === "message_delta") {
                outputTokens = parsed.usage?.output_tokens || outputTokens;
              } else if (parsed.type === "message_start") {
                inputTokens = parsed.message?.usage?.input_tokens || 0;
              }
            } catch {
              // Ignore parse errors for malformed JSON
            }
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

async function trackUsage(
  env: Env,
  userId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO ai_usage (id, user_id, input_tokens, output_tokens, model)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    inputTokens,
    outputTokens,
    "claude-sonnet-4-20250514"
  ).run();
}
