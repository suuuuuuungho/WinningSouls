import { useState } from "react";
import IconRail from "./components/IconRail.jsx";
import ChatHeader from "./components/ChatHeader.jsx";
import ChatArea from "./components/ChatArea.jsx";
import { askQuestion } from "./lib/api.js";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);

  async function handleAsk(question) {
    if (!question.trim() || pending) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setPending(true);

    try {
      const data = await askQuestion(question);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, sql: data.sql, rows: data.rows },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "error", content: err.message || String(err) },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-background font-body-md text-on-background">
      <IconRail />
      <div className="pl-[72px]">
        <ChatHeader />
        <main className="pt-20 h-screen">
          <ChatArea messages={messages} pending={pending} onAsk={handleAsk} />
        </main>
      </div>
    </div>
  );
}
