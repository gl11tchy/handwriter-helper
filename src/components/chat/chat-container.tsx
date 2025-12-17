import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { useChat } from "@/hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function ChatContainer() {
  const { messages, isLoading, error, sendMessage, clearMessages } = useChat();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">AI Chat</h2>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearMessages}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>
      {error && (
        <div className="border-b bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <MessageList messages={messages} />
      <MessageInput onSend={sendMessage} isLoading={isLoading} />
    </div>
  );
}
