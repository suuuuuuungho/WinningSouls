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

중요: Att_1~Att_School, Att 테이블의 Div 컬럼은 과거 데이터 중 일부가 "중등부 1학년 1-1반"처럼
정리되지 않은 값으로 들어가있을 수 있어 신뢰할 수 없다. "부서"(중등부/중등부 신입부)로 필터링해야
하면 Att.Div를 직접 비교하지 말고 반드시 Member와 JOIN해서 Member.Division(정리된 값, '중등부' 또는
'중등부 신입부')을 사용해라. Div_Grade/Div_Class는 원래부터 깨끗하니 그대로 사용해도 된다.
`;

const SQL_SYSTEM_PROMPT = `너는 교회 출석 데이터베이스(SQLite/libSQL)에 대한 SQL 생성기다.
다음 스키마만 사용해서 사용자 질문에 답할 수 있는 SQL SELECT 쿼리 한 개만 생성해라.

${SCHEMA_DESC}

규칙:
- 반드시 SELECT 문 하나만 생성 (세미콜론으로 여러 문장 연결 금지)
- INSERT/UPDATE/DELETE/DROP/ALTER/PRAGMA/ATTACH/CREATE 등 쓰기/시스템 명령 금지
- 다른 설명 없이 \`\`\`sql 코드블록 안에 쿼리만 출력
- 오늘 날짜가 필요하면 SQLite의 date('now','localtime') 사용
- 몇 명인지/명단 등 여러 교인이 조건에 맞는지 묻는 질문이어도 COUNT(*)로 집계하지 말고
  해당 교인들의 개별 행(ID, Name 등 식별 가능한 컬럼 포함)을 그대로 SELECT해라. 개수는
  결과 행 개수로 알 수 있고, 화면에서 상세 목록을 팝업으로 보여줘야 하므로 원본 행이 필요하다.
  (단, "평균 출석률" 같이 애초에 숫자 하나만 의미가 있는 질문은 그대로 집계해도 된다.)
- "이번 주"/"지난 주"처럼 최근 날짜를 가리키는 질문은 date('now') 기준 요일 계산으로 날짜를
  추측하지 말고, Att_Date 컬럼에 실제로 존재하는 값 중 가장 최근 값들을 써라. 예를 들어
  "지난주에는 왔는데 이번주 안 온 학생"처럼 최근 두 주를 비교하는 질문은 이런 패턴을 참고해라:
  \`\`\`sql
  WITH recent AS (
    SELECT DISTINCT Att_Date FROM Att ORDER BY Att_Date DESC LIMIT 2
  )
  SELECT a1.ID, a1.Name, a1.Div_Class
  FROM Att a1
  JOIN Att a2 ON a1.ID = a2.ID
  WHERE a1.Att_Date = (SELECT MIN(Att_Date) FROM recent)
    AND a1.Att IN ('참석', '타예배')
    AND a2.Att_Date = (SELECT MAX(Att_Date) FROM recent)
    AND a2.Att = '불참'
  \`\`\`
- "출석률이 제일 낮은/높은 반은?"처럼 그룹별 비율을 비교하는 질문은 이런 패턴을 참고해라:
  \`\`\`sql
  SELECT Div_Class,
         ROUND(SUM(CASE WHEN Att IN ('참석','타예배') THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) AS 출석률
  FROM Att
  WHERE Att_Date >= (SELECT date(MAX(Att_Date), '-84 days') FROM Att)
  GROUP BY Div_Class
  ORDER BY 출석률 ASC
  LIMIT 5
  \`\`\`
- 이름으로 찾는 질문은 동명이인이 있을 수 있으니 임의로 한 명만 고르지 말고 이름이 일치하는
  행을 전부 반환해라(필요하면 ID/Div_Class로 구분되게):
  \`\`\`sql
  SELECT ID, Name, Div_Grade, Div_Class, Att_Date, Att
  FROM Att
  WHERE Name = '홍길동'
  ORDER BY Att_Date DESC
  LIMIT 20
  \`\`\`
- "OOO 인도자 밑에 학생들 중 결석 많은 사람" 같은 인도자 기준 질문은 Member와 JOIN해라
  (Att_1~Att_School/Att 테이블에는 Leader 컬럼이 없다):
  \`\`\`sql
  SELECT a.ID, a.Name, COUNT(*) AS 결석수
  FROM Att a
  JOIN Member m ON a.ID = m.ID
  WHERE m.Leader = '김리더'
    AND a.Att = '불참'
    AND a.Att_Date >= (SELECT date(MAX(Att_Date), '-84 days') FROM Att)
  GROUP BY a.ID, a.Name
  ORDER BY 결석수 DESC
  \`\`\``;

const SQL_RETRY_SUFFIX = (errorMessage) =>
  `방금 응답은 유효한 SQL이 아닙니다 (${errorMessage}). 다른 설명 없이 \`\`\`sql 코드블록 안에 ` +
  `SELECT 또는 WITH로 시작하는 SQL 쿼리 한 개만 다시 출력해라.`;

class SqlGenerationError extends Error {}

async function generateSql(env, question) {
  const messages = [{ role: "user", content: question }];
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const sqlText = await callClaude(env, { system: SQL_SYSTEM_PROMPT, messages });
    try {
      return validateSql(extractSql(sqlText));
    } catch (err) {
      lastErr = err;
      if (attempt === 1) break;
      messages.push({ role: "assistant", content: sqlText });
      messages.push({ role: "user", content: SQL_RETRY_SUFFIX(err.message) });
    }
  }
  throw new SqlGenerationError(lastErr.message);
}

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

      let sql;
      try {
        sql = await generateSql(env, question);
      } catch (err) {
        if (err instanceof SqlGenerationError) {
          return json(
            {
              sql: null,
              rows: [],
              answer: "죄송해요, 질문을 이해하지 못했어요. 다르게 표현해서 다시 물어봐 주시겠어요?",
            },
            200,
            env
          );
        }
        throw err;
      }

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

      if (rows.length === 0) {
        return json({ sql, rows, answer: "해당 조건에 맞는 결과가 없습니다." }, 200, env);
      }

      if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
        return json({ sql, rows, answer: `${Object.values(rows[0])[0]}` }, 200, env);
      }

      const preview =
        rows.length > 5
          ? JSON.stringify({ count: rows.length, sample: rows.slice(0, 5) })
          : JSON.stringify(rows);
      const answer = await callClaude(env, {
        system:
          "너는 교회 출석 데이터 조회 결과를 한국어로 간결하게 요약해서 답해주는 도우미다. " +
          "숫자와 이름 등 사실만 근거로 답하고, 결과에 없는 내용은 추측하지 마라. " +
          "결과가 여러 행(예: 명단)이면 이름을 나열하지 말고 개수와 핵심 요약만 답하고, " +
          "'상세 내역은 아래 상세 내용 보기를 눌러서 확인해보세요' 라는 안내로 마무리해라. " +
          "결과가 한두 건이면 그 내용을 그대로 답하면 되고 위 안내 문구는 붙이지 않아도 된다.",
        messages: [
          {
            role: "user",
            content: `질문: ${question}\n\n쿼리 결과(JSON):\n${preview}`,
          },
        ],
        maxTokens: 200,
      });

      return json({ sql, rows, answer }, 200, env);
    } catch (err) {
      return json({ error: String(err.message || err) }, 500, env);
    }
  },
};
