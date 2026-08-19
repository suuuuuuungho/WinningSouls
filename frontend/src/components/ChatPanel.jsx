import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble.jsx";
import "./ChatPanel.css";

export default function ChatPanel({ messages, pending, onAsk }) {
  const [value, setValue] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  function handleSubmit(e) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    setValue("");
    onAsk(q);
  }

  return (
    <section className="chat-tile">
      <div className="container chat-tile__inner">
        <h2 className="t-display-lg chat-tile__title">지금 물어보세요</h2>
        <p className="t-lead chat-tile__lead">질문을 입력하면 바로 답해드립니다.</p>

        <div className="chat-card">
          <div className="chat-card__messages" ref={scrollRef}>
            {messages.length === 0 && (
              <p className="chat-card__empty t-caption">
                아직 대화가 없습니다. 위 예시 질문을 눌러보거나 아래에 직접 입력해보세요.
              </p>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            {pending && (
              <div className="msg-row msg-row--assistant">
                <div className="msg-bubble msg-bubble--assistant t-body chat-card__typing">
                  답변을 준비하고 있어요...
                </div>
              </div>
            )}
          </div>

          <form className="chat-card__input-bar" onSubmit={handleSubmit}>
            <input
              className="chat-card__input t-body"
              type="text"
              placeholder="예: 지난달 결석자 명단 보여줘"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
            />
            <button type="submit" className="btn btn-primary" disabled={pending || !value.trim()}>
              전송
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
