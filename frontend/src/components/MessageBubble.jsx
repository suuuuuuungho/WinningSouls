import "./MessageBubble.css";

function ResultTable({ rows }) {
  if (!rows || rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  const shown = rows.slice(0, 50);

  return (
    <div className="result-table-wrap">
      <table className="result-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className="t-caption-strong">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className="t-caption">
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

export default function MessageBubble({ message }) {
  if (message.role === "user") {
    return (
      <div className="msg-row msg-row--user">
        <div className="msg-bubble msg-bubble--user t-body">{message.content}</div>
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="msg-row msg-row--assistant">
        <div className="msg-bubble msg-bubble--error t-body">{message.content}</div>
      </div>
    );
  }

  return (
    <div className="msg-row msg-row--assistant">
      <div className="msg-bubble msg-bubble--assistant t-body">
        {message.content}

        {message.rows && message.rows.length > 0 && (
          <details className="msg-details">
            <summary className="t-caption">
              결과 {message.rows.length}행 · 생성된 SQL 보기
            </summary>
            <pre className="msg-sql t-fine-print">{message.sql}</pre>
            <ResultTable rows={message.rows} />
          </details>
        )}
      </div>
    </div>
  );
}
