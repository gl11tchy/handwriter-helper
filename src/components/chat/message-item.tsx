import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import { User, Bot } from "lucide-react";

export function MessageItem({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 p-4", isUser ? "bg-muted/50" : "")}>
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        isUser ? "bg-primary text-primary-foreground" : "bg-secondary"
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium">{isUser ? "You" : "Assistant"}</p>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap">{message.content || "..."}</p>
        </div>
      </div>
    </div>
  );
}
