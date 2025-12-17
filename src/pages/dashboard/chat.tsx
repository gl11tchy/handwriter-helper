import { Header } from "@/components/layout/header";
import { ChatContainer } from "@/components/chat/chat-container";

export default function ChatPage() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-hidden">
        <ChatContainer />
      </main>
    </div>
  );
}
