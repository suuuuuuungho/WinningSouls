import { useState } from "react";
import GlobalNav from "./components/GlobalNav.jsx";
import Hero from "./components/Hero.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import Footer from "./components/Footer.jsx";
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
    <div className="page">
      <GlobalNav />
      <Hero onExample={handleAsk} disabled={pending} />
      <ChatPanel messages={messages} pending={pending} onAsk={handleAsk} />
      <Footer />
    </div>
  );
}
