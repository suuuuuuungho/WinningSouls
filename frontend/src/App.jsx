import { useState } from "react";
import IconRail from "./components/IconRail.jsx";
import ChatHeader from "./components/ChatHeader.jsx";
import ChatArea from "./components/ChatArea.jsx";
import AttendanceView from "./components/attendance/AttendanceView.jsx";
import { askQuestion } from "./lib/api.js";

export default function App() {
  const [view, setView] = useState("chat");
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
      <IconRail activeView={view} onNavigate={setView} />
      <div className="pl-[72px]">
        {view === "chat" ? (
          <>
            <ChatHeader />
            <main className="pt-20 h-screen">
              <ChatArea messages={messages} pending={pending} onAsk={handleAsk} />
            </main>
          </>
        ) : (
          <>
            <ChatHeader
              title="출석 현황 표"
              subtitle="교인 출석 데이터 조회"
              icon="calendar_month"
            />
            <main className="pt-20 h-screen overflow-y-auto custom-scrollbar">
              <AttendanceView />
            </main>
          </>
        )}
      </div>
    </div>
  );
}
