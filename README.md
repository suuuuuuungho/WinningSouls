# 교인 출석 파이프라인 + QA 서비스

디모데(w.yonsei.or.kr)에서 출석통계/교인목록 엑셀을 자동으로 받아와 **Turso(원격 SQLite)**에
누적하고, **Cloudflare Workers** API + **GitHub Pages** 정적 프론트엔드로 자연어 질문에 답합니다.

```
[디모데 웹] --Playwright(로컬 PC)--> [엑셀] --pandas--> [Turso DB]
                                                            ^
                                                            | SQL 조회
[GitHub Pages 프론트엔드] --fetch--> [Cloudflare Worker] ---+---> Claude API (NL -> SQL, 요약)
```

## 폴더 구조
- `db.py`, `scraper.py`, `parse_load.py`, `pipeline.py` : 로컬에서 도는 수집 파이프라인 (Python)
- `worker/` : Cloudflare Worker (Claude 호출 + Turso 조회를 담당하는 API, 키가 여기서만 보관됨)
- `frontend/` : GitHub Pages에 올릴 React(Vite) 채팅 UI
- `.github/workflows/deploy-frontend.yml` : `frontend/` 변경 시 자동 빌드 + GitHub Pages 배포

## 0. 계정 준비 — ✅ 완료
Turso, Cloudflare 계정 생성 및 로그인, Anthropic API 키 발급/크레딧 충전까지 이미 완료했습니다.
(다시 설정해야 할 경우를 위해 아래에 명령어를 남겨둡니다.)

<details>
<summary>참고용 명령어 (이미 완료됨)</summary>

### Turso (무료 원격 SQLite)
```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup   # 또는 이미 계정 있으면 turso auth login
turso db create attendance-db
turso db show attendance-db --url
turso db tokens create attendance-db
```
나온 URL과 토큰을 `.env`의 `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`에 넣습니다.

### Cloudflare (무료 Workers)
```bash
cd worker
npm install
npx wrangler login
```

### Anthropic API 키
https://console.anthropic.com 에서 발급 후 Plans & Billing에서 크레딧 충전.
</details>

## 1. 로컬 파이프라인 설치

```bash
pip install -r requirements.txt
playwright install chromium
python db.py   # Turso에 테이블 생성 확인
```

## 2. 스크래퍼 선택자 보정 (최초 1회)

로그인 폼(아이디/패스워드/로그인 버튼)은 이미 확인되어 `scraper.py`에 반영돼 있습니다.
다만 로그인 **이후** 화면(출석통계 페이지의 기관/기간/예배 선택 UI, 엑셀 버튼)은 실제 로그인해서
봐야 정확한 선택자를 알 수 있어 TODO로 남겨두었습니다.

가장 쉬운 보정 방법 — Playwright codegen으로 직접 녹화:
```bash
playwright codegen "https://w.yonsei.or.kr/yonsei/member/?year=2026&lang=ko#/attendance/statistics"
```
브라우저가 열리면 평소처럼 로그인 → 기관/기간/예배 선택 → 검색 → 엑셀 버튼 클릭까지 진행하면
Inspector 창에 해당 동작의 코드가 자동 생성됩니다. 그 코드를 `scraper.py`의
`download_attendance_excel` 함수 TODO 부분에 옮겨 붙이세요. `#/person/list`도 동일하게
확인해보면 좋습니다.

## 3. 엑셀 컬럼 매핑 보정 (최초 1회)

```bash
python parse_load.py downloads/members_2026-08-19.xlsx --peek
```
실제 컬럼명을 확인한 뒤 `parse_load.py` 상단 `MEMBER_COLUMN_MAP`, `ATTENDANCE_COLUMN_MAP`을
실제 헤더명으로 맞춰주세요. 매핑이 틀려도 `raw_json` 컬럼에 원본이 그대로 보존되니 데이터
유실은 없습니다. 특히 **동명이인을 구분할 고유 교인번호 컬럼**이 있는지 확인해서 `member_id`
매핑에 채워주세요 (없으면 이름만으로 구분).

## 4. 파이프라인 실행 & 자동화

```bash
python pipeline.py
```
최초 실행 시 최근 90일치(`INITIAL_LOOKBACK_DAYS`)를 수집, 이후엔 마지막 실행일 이후 ~ 오늘까지
증분 수집합니다. `scraper.py`의 `HEADLESS = False`로 두고 처음 몇 번은 눈으로 확인 후,
잘 되면 `True`로 바꿔 Windows 작업 스케줄러에 등록하세요 (매주 1회 권장).

- 프로그램/스크립트: `python.exe`의 전체 경로
- 인수 추가: `pipeline.py`
- 시작 위치: 이 프로젝트 폴더 경로

## 5. Cloudflare Worker 배포 — ✅ 완료

```bash
cd worker
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
npx wrangler deploy
```
배포된 주소: **https://attendance-qa.parksh5573.workers.dev**
(`/` 로 헬스체크, `/ask` 로 질문 POST — 실제 질문→SQL→Turso 조회→답변 전체 플로우 테스트 완료)

GitHub Pages 주소가 정해지면 `wrangler.toml`의 `ALLOWED_ORIGIN`을 그 주소로 바꾸고
`npx wrangler deploy`를 다시 실행해 CORS를 그 도메인으로만 제한하세요 (현재는 `*`).

## 6. 프론트엔드 (React/Vite) 로컬 실행 & 배포

- 로컬 개발: `frontend/.env.local`에 `VITE_WORKER_URL=https://attendance-qa.parksh5573.workers.dev/ask`
  설정 후 `cd frontend && npm install && npm run dev`
- GitHub Pages 배포: 이 저장소를 GitHub에 올리면 `.github/workflows/deploy-frontend.yml`이
  `frontend/` 변경 시 자동으로 빌드해 Pages에 배포합니다. 저장소 **Settings → Pages**에서
  Source를 "GitHub Actions"로 설정하고, **Settings → Secrets and variables → Actions → Variables**에
  `VITE_WORKER_URL` = `https://attendance-qa.parksh5573.workers.dev/ask` 를 등록해주세요.

## 비용 정리
| 구성요소 | 비용 |
|---|---|
| Playwright, pandas, 로컬 파이프라인 | 무료 |
| Turso (무료 티어: 수 GB, 월 수억 행 읽기) | 무료 |
| Cloudflare Workers (무료 티어: 10만 요청/일) | 무료 |
| GitHub Pages | 무료 |
| Claude API (Haiku, 질문당 SQL 생성+요약 2회 호출) | 질문 1건당 매우 저렴, 개인/소규모 사용 기준 월 사용료 미미 |

## 개인정보 유의
교인 이름·생년월일·연락처는 개인정보보호법 대상 정보입니다.
- Turso DB, Worker 환경변수(secret)에는 비밀번호/키가 평문으로 저장되니 저장소에 `.env`나
  `wrangler.toml`의 실제 값(비밀값은 secret으로만 관리하므로 파일엔 없음)을 커밋하지 마세요.
- `.env`, `downloads/`는 `.gitignore`에 반드시 포함하세요.
- 프론트엔드는 공개 URL이 되므로, Worker의 `ALLOWED_ORIGIN`을 본인 GitHub Pages 도메인으로
  제한하고, 필요하다면 Worker 단에 간단한 접근 토큰(비밀 질문 헤더 등)을 추가하는 것을 권장합니다.
