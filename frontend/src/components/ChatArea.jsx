import { useEffect, useRef, useState } from "react";
import Modal from "./Modal.jsx";

function ResultTable({ rows }) {
  const cols = Object.keys(rows[0]).filter((c) => c !== "ID");
  const sorted = [...rows].sort((a, b) => {
    if (a.Div_Class == null || b.Div_Class == null) return 0;
    return String(a.Div_Class).localeCompare(String(b.Div_Class), "ko");
  });
  const shown = sorted.slice(0, 50);

  return (
    <div className="overflow-x-auto custom-scrollbar rounded-xl border border-outline-variant/30">
      <table className="w-full text-label-sm">
        <thead>
          <tr className="bg-surface-container-low">
            {cols.map((c) => (
              <th key={c} className="text-left px-sm py-xs font-body-md-bold text-on-surface whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i} className="border-t border-outline-variant/20">
              {cols.map((c) => (
                <td key={c} className="px-sm py-xs text-on-surface-variant whitespace-nowrap">
                  {row[c] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultAttachment({ rows }) {
  const [open, setOpen] = useState(false);
  if (!rows || rows.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-xs mt-sm text-label-sm font-label-sm text-primary hover:underline"
      >
        <span className="material-symbols-outlined text-[16px]">table_chart</span>
        상세 내용 보기 ({rows.length}행)
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="상세 내용">
        <ResultTable rows={rows} />
      </Modal>
    </>
  );
}

function MessageBubble({ message }) {
  if (message.role === "user") {
    return (
      <div className="flex items-end justify-end gap-sm mt-lg">
        <div className="max-w-[75%] flex flex-col items-end gap-base">
          <div className="bg-primary text-on-primary px-md py-sm rounded-2xl rounded-br-sm shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05),0_2px_4px_-2px_rgba(0,0,0,0.03)]">
            <p className="text-body-md font-body-md whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  const isError = message.role === "error";

  return (
    <div className="flex items-end gap-sm mt-lg">
      <div className="w-8 h-8 rounded-full bg-primary flex-shrink-0 flex items-center justify-center shadow-sm">
        <span className="material-symbols-outlined text-on-primary text-[16px]">smart_toy</span>
      </div>
      <div className="max-w-[75%] flex flex-col gap-base">
        <div
          className={`px-md py-sm rounded-2xl rounded-bl-sm shadow-[0_2px_4px_-2px_rgba(0,0,0,0.03)] border ${
            isError
              ? "bg-error/10 border-error/30 text-error"
              : "bg-surface-container-low border-outline-variant/10 text-on-surface"
          }`}
        >
          <p className="text-body-md font-body-md whitespace-pre-wrap">{message.content}</p>
        </div>
        {!isError && <ResultAttachment rows={message.rows} />}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-sm mt-lg">
      <div className="w-8 h-8 rounded-full bg-primary flex-shrink-0 flex items-center justify-center shadow-sm">
        <span className="material-symbols-outlined text-on-primary text-[16px]">smart_toy</span>
      </div>
      <div className="bg-surface-container-low px-md py-sm rounded-2xl rounded-bl-sm border border-outline-variant/10 flex items-center gap-1 w-16 h-10">
        <div className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50 animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50 animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-lg">
      <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-lg shadow-md">
        <span className="material-symbols-outlined text-on-primary text-[32px]">smart_toy</span>
      </div>
      <h1 className="text-headline-md font-headline-md text-on-surface mb-xs">교인 출석, 물어보세요</h1>
      <p className="text-body-md font-body-md text-on-surface-variant mb-lg max-w-sm">
        디모데에 쌓인 출석 데이터를 바탕으로 자연어 질문에 답합니다.
      </p>
    </div>
  );
}

export default function ChatArea({ messages, pending, onAsk }) {
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
    <section className="flex flex-col flex-1 h-full bg-surface">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-lg py-xl relative custom-scrollbar">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="flex justify-center sticky top-0 z-10 mb-md">
              <div className="bg-surface-container-low/80 backdrop-blur-md px-sm py-base rounded-full shadow-sm border border-outline-variant/20">
                <span className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest">
                  오늘
                </span>
              </div>
            </div>
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            {pending && <TypingIndicator />}
          </>
        )}
      </div>

      <div className="px-lg py-md bg-surface border-t border-outline-variant/20 relative z-20">
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-sm bg-surface-container-low rounded-2xl p-sm shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-primary/20 transition-all"
        >
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={pending}
            rows={1}
            placeholder="질문을 입력하세요..."
            className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-xs px-sm text-body-md font-body-md text-on-surface placeholder:text-on-surface-variant/70 min-h-[40px] max-h-[120px] custom-scrollbar"
          />
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center hover:bg-primary/90 shadow-sm transition-all transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[20px] ml-1">send</span>
          </button>
        </form>
        <p className="text-label-sm font-label-sm text-on-surface-variant text-center mt-xs">
          내부 교인 관리용 도구입니다 · 질문/조회 결과 일부만 서버로 전달됩니다
        </p>
      </div>
    </section>
  );
}
