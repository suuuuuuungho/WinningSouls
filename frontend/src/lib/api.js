const WORKER_URL = import.meta.env.VITE_WORKER_URL;

export async function askQuestion(question) {
  if (!WORKER_URL) {
    throw new Error(
      "VITE_WORKER_URL이 설정되지 않았습니다. .env.local 파일에 Worker 주소를 넣어주세요."
    );
  }

  const resp = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error(data.error || resp.statusText);
  }
  return data;
}
