import { createClient } from "@libsql/client/web";

const MODEL = "claude-haiku-4-5-20251001";

const SCHEMA_DESC = `
members (교인 목록)
  member_key TEXT PRIMARY KEY, name TEXT, birth_date TEXT, gender TEXT, phone TEXT,
  position TEXT, cell_group TEXT, institution TEXT, status TEXT, updated_at TEXT

attendance (출석 기록)
  member_key TEXT, member_name TEXT, service_date TEXT(YYYY-MM-DD), service_type TEXT,
  institution TEXT, present TEXT, inserted_at TEXT
`;

const SQL_SYSTEM_PROMPT = `너는 교회 출석 데이터베이스(SQLite/libSQL)에 대한 SQL 생성기다.
다음 스키마만 사용해서 사용자 질문에 답할 수 있는 SQL SELECT 쿼리 한 개만 생성해라.

${SCHEMA_DESC}

규칙:
- 반드시 SELECT 문 하나만 생성 (세미콜론으로 여러 문장 연결 금지)
- INSERT/UPDATE/DELETE/DROP/ALTER/PRAGMA/ATTACH/CREATE 등 쓰기/시스템 명령 금지
- 다른 설명 없이 \`\`\`sql 코드블록 안에 쿼리만 출력
- 오늘 날짜가 필요하면 SQLite의 date('now','localtime') 사용`;

const FORBIDDEN = /\b(insert|update|delete|drop|alter|attach|pragma|create|replace)\b/i;

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

async function callClaude(env, { system, messages, maxTokens = 500 }) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Claude API error (${resp.status}): ${text}`);
  }
  const data = await resp.json();
  return data.content[0].text;
}

function extractSql(text) {
  const match = text.match(/```sql\s*([\s\S]*?)```/i);
  return (match ? match[1] : text).trim();
}

function validateSql(sql) {
  const stripped = sql.trim().replace(/;+\s*$/, "");
  if (stripped.includes(";")) throw new Error("여러 SQL 문장은 허용되지 않습니다.");
  if (!/^select/i.test(stripped)) throw new Error("SELECT 쿼리만 허용됩니다.");
  if (FORBIDDEN.test(stripped)) throw new Error("허용되지 않는 SQL 키워드가 포함되어 있습니다.");
  return stripped;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return json({ ok: true, service: "attendance-qa-worker" }, 200, env);
    }

    if (url.pathname !== "/ask" || request.method !== "POST") {
      return json({ error: "not found" }, 404, env);
    }

    try {
      const { question } = await request.json();
      if (!question || typeof question !== "string") {
        return json({ error: "question 필드가 필요합니다." }, 400, env);
      }

      const sqlText = await callClaude(env, {
        system: SQL_SYSTEM_PROMPT,
        messages: [{ role: "user", content: question }],
      });
      const sql = validateSql(extractSql(sqlText));

      const db = createClient({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN,
      });
      const result = await db.execute(sql);
      const rows = result.rows.map((row) => {
        const obj = {};
        result.columns.forEach((col, i) => (obj[col] = row[i]));
        return obj;
      });

      const preview = JSON.stringify(rows.slice(0, 50));
      const answer = await callClaude(env, {
        system:
          "너는 교회 출석 데이터 조회 결과를 한국어로 간결하게 요약해서 답해주는 도우미다. " +
          "숫자와 이름 등 사실만 근거로 답하고, 결과에 없는 내용은 추측하지 마라.",
        messages: [
          {
            role: "user",
            content: `질문: ${question}\n\n쿼리 결과(JSON, 최대 50행):\n${preview}`,
          },
        ],
      });

      return json({ sql, rows, answer }, 200, env);
    } catch (err) {
      return json({ error: String(err.message || err) }, 500, env);
    }
  },
};
