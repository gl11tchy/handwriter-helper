import { useState, useCallback, useRef } from "react";
import type { Message } from "@/types";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Use ref to avoid stale closure in sendMessage callback
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const sendMessage = useCallback(async (content: string) => {
    setError(null);
    setIsLoading(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: [...messagesRef.current, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Chat failed");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processLine = (line: string) => {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "delta") {
              setMessages((prev) => {
                const lastIndex = prev.length - 1;
                const last = prev[lastIndex];
                if (last.role === "assistant") {
                  return [
                    ...prev.slice(0, lastIndex),
                    { ...last, content: last.content + data.content }
                  ];
                }
                return prev;
              });
            }
          } catch {
            // Ignore parse errors for malformed JSON
          }
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Process any remaining buffer content
            if (buffer.trim()) {
              processLine(buffer);
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            processLine(line);
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
      // Remove both user message and empty assistant message that were added
      setMessages((prev) => prev.slice(0, -2));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
  };
}
