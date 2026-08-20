import { createClient } from "@libsql/client/web";

const MODEL = "claude-haiku-4-5-20251001";

const SCHEMA_DESC = `
Member (교인 목록 - 중등부/중등부 신입부만, 교사는 제외됨)
  ID TEXT PRIMARY KEY   -- 교번(고유 회원번호)
  Name TEXT
  Division TEXT         -- 소속 기관 ('중등부' 또는 '중등부 신입부')
  Birth_Date TEXT        -- YYYY-MM-DD
  Gender TEXT            -- '남' 또는 '여'
  Resister_date TEXT     -- 등록일 YYYY-MM-DD
  Phone TEXT
  Status TEXT             -- 현재 상태 (예: '정회원', '일반회원', '신입회원', '섬김회원')
  Leader_ID TEXT           -- 인도자(리더)의 교번
  Leader TEXT              -- 인도자 이름
  Leader_Div TEXT          -- 인도자 소속
  Leader_Phone TEXT

Att_1 / Att_2 / Att_3 / Att_4 / Att_School
  (각각 주일 1부/2부/3부/4부 예배, 교회학교의 예배별 출석 기록. 구조는 5개 테이블 전부 동일하고
   값 컬럼 이름만 테이블명과 같음: Att_1 테이블은 Att_1 컬럼, Att_School 테이블은 Att_School 컬럼.
   조회 기간(최근 1년, 롤링 윈도우) 내 그 예배가 있었던 날짜마다, 교인 전원에 대해 무조건 한 행씩 있음
   - 결석도 명시적으로 행이 있고 값이 '불참'임. 즉 이 테이블들만으로 특정 예배의
   "결석자"를 바로 WHERE 절로 조회할 수 있음 (JOIN 불필요).)
  ID TEXT           -- Member.ID 와 동일 값
  Name TEXT
  Div TEXT           -- '중등부' 또는 '중등부 신입부'
  Div_Grade TEXT      -- 학년
  Div_Class TEXT       -- 반
  Status TEXT
  Resister_date TEXT
  Att_Date TEXT         -- YYYY-MM-DD, 그 예배가 있었던 날짜
  Att_1 (또는 Att_2/Att_3/Att_4/Att_School) TEXT  -- '참석' / '가정' / '불참' 중 하나

Att (주일 단위 집계 - 예배 하나라도 참석하면 "주일예배 참석"으로 인정한 최종 결과.
     Att_1~Att_School과 마찬가지로 교인 x Att_Date 전체에 대해 행이 다 있음)
  ID, Name, Div, Div_Grade, Div_Class, Status, Resister_date, Att_Date  -- 위와 동일 의미
  Att_1, Att_2, Att_3, Att_4, Att_School TEXT  -- 각 예배 테이블의 값을 그대로 복사한 것
  Att TEXT   -- 그 주일의 최종 분류. 아래 우선순위로 계산된 값이며 반드시 이 4개 문자열 중 하나:
                '참석'   : 교회학교를 참석함
                '타예배' : 교회학교는 안 왔지만 1부/2부/3부/4부 중 하나는 참석함
                '가정'   : 참석은 하나도 없지만 가정예배는 했음
                '불참'   : 아무것도 안 함
              -> "주일예배 결석자"는 WHERE Att='불참' 로 바로 구할 수 있음 (JOIN 불필요).
              -> "주일예배 참석"을 넓게 물으면(교회학교든 다른 예배든 상관없이) Att IN ('참석','타예배') 사용.

중요: Att_1~Att_School, Att 테이블에는 Member의 Leader_ID/Leader/Leader_Div/Leader_Phone/Phone/Birth_Date/Gender
컬럼이 없다. 이 값들이 필요하면 반드시 Member와 JOIN 해야 한다 (예: JOIN Member m ON Att.ID = m.ID),
Att/Att_1~Att_School 테이블에 직접 Leader_Div 등을 쓰면 "no such column" 에러가 난다.
이 데이터베이스에는 "구역" 이라는 별도 테이블/컬럼이 없다. 사용자가 "구역"을 물으면 문맥상 가장 가까운
그룹핑 기준(Div_Class(반) 또는 Member와 JOIN한 Leader_Div(인도자 소속)) 중 더 맞는 쪽을 선택해서 사용하고,
존재하지 않는 컬럼명을 그대로 지어내지 마라.
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

// 표(pivot) 전용 고정 SQL 엔드포인트에서 쓰는 테이블 allow-list.
// 테이블명은 SQL 파라미터로 바인딩할 수 없으므로 반드시 이 매핑을 거쳐서만 문자열 삽입한다.
// 값 컬럼명은 테이블명과 동일하다 (db.py의 ATT_TABLES 규칙과 동일).
const ATT_SOURCES = { agg: "Att", "1": "Att_1", "2": "Att_2", "3": "Att_3", "4": "Att_4", school: "Att_School" };

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  if (!/^(select|with)\b/i.test(stripped)) throw new Error("SELECT 쿼리만 허용됩니다.");
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

    if (url.pathname === "/att/meta" && request.method === "GET") {
      try {
        const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
        // Att.Div는 과거 데이터에서 "중등부 1학년 1-1반"처럼 깨끗하지 않은 값이 섞여있을 수 있어
        // (부서 자체는 Member.Division이 정답 소스), 부서 필터 옵션은 Member와 JOIN해서 구한다.
        const [classesResult, datesResult] = await Promise.all([
          db.execute(
            "SELECT DISTINCT m.Division, a.Div_Grade, a.Div_Class FROM Att a JOIN Member m ON a.ID = m.ID ORDER BY m.Division, a.Div_Grade, a.Div_Class"
          ),
          db.execute("SELECT DISTINCT Att_Date FROM Att ORDER BY Att_Date"),
        ]);
        const classes = classesResult.rows.map((row) => ({ div: row[0], grade: row[1], class: row[2] }));
        const dates = datesResult.rows.map((row) => row[0]);
        return json({ classes, dates }, 200, env);
      } catch (err) {
        return json({ error: String(err.message || err) }, 500, env);
      }
    }

    if (url.pathname === "/att/rows" && request.method === "POST") {
      try {
        const body = await request.json();
        const table = ATT_SOURCES[body.source];
        if (!table) {
          return json({ error: "알 수 없는 출석 구분입니다." }, 400, env);
        }

        const clauses = [];
        const args = {};
        // Att.Div는 과거 데이터에서 깨끗하지 않은 값이 섞여있을 수 있어 부서 필터는
        // Member.Division(정답 소스)과 JOIN해서 건다. Div_Grade/Div_Class는 원래도 깨끗해서 그대로 사용.
        const needsMemberJoin = !!body.div;
        if (body.div) {
          clauses.push("m.Division = :div");
          args.div = body.div;
        }
        if (body.dateFrom) {
          clauses.push(`${table}.Att_Date >= :dateFrom`);
          args.dateFrom = body.dateFrom;
        }
        if (body.dateTo) {
          clauses.push(`${table}.Att_Date <= :dateTo`);
          args.dateTo = body.dateTo;
        }
        if (Array.isArray(body.grades) && body.grades.length) {
          const placeholders = body.grades.map((_, i) => `:grade${i}`);
          body.grades.forEach((g, i) => (args[`grade${i}`] = g));
          clauses.push(`${table}.Div_Grade IN (${placeholders.join(",")})`);
        }
        if (Array.isArray(body.classes) && body.classes.length) {
          const placeholders = body.classes.map((_, i) => `:class${i}`);
          body.classes.forEach((c, i) => (args[`class${i}`] = c));
          clauses.push(`${table}.Div_Class IN (${placeholders.join(",")})`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const join = needsMemberJoin ? `JOIN Member m ON ${table}.ID = m.ID` : "";

        const sql = `SELECT ${table}.ID, ${table}.Name, ${table}.Div_Grade, ${table}.Div_Class, ${table}.Att_Date, ${table}.${table} AS Value
                     FROM ${table} ${join} ${where}
                     ORDER BY ${table}.Div_Grade, ${table}.Div_Class, ${table}.ID, ${table}.Att_Date
                     LIMIT 20000`;

        const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
        const result = await db.execute({ sql, args });
        const rows = result.rows.map((row) => {
          const obj = {};
          result.columns.forEach((col, i) => (obj[col] = row[i]));
          return obj;
        });
        return json({ rows, truncated: rows.length === 20000 }, 200, env);
      } catch (err) {
        return json({ error: String(err.message || err) }, 500, env);
      }
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
          "숫자와 이름 등 사실만 근거로 답하고, 결과에 없는 내용은 추측하지 마라. " +
          "결과가 여러 행(예: 명단)이면 이름을 나열하지 말고 개수와 핵심 요약만 답하고, " +
          "'상세 내역은 아래 상세 내용 보기를 눌러서 확인해보세요' 라는 안내로 마무리해라. " +
          "결과가 한두 건이거나 단일 값(개수 등)이면 그 값만 답하면 되고 위 안내 문구는 붙이지 않아도 된다.",
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
