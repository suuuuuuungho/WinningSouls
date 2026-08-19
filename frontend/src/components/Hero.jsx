import "./Hero.css";

const EXAMPLES = [
  "지난주 주일예배 결석자 명단 보여줘",
  "이번 달 출석률이 가장 낮은 구역은?",
  "홍길동 최근 4주 출석 몇 번?",
];

export default function Hero({ onExample, disabled }) {
  return (
    <section className="hero">
      <div className="container hero__inner">
        <h1 className="t-hero-display hero__title">
          교인 출석,
          <br />
          물어보세요.
        </h1>
        <p className="t-lead-airy hero__lead">
          디모데에 쌓인 출석 데이터를 바탕으로 자연어 질문에 답합니다.
        </p>

        <div className="hero__examples">
          {EXAMPLES.map((q) => (
            <button
              key={q}
              type="button"
              className="btn btn-secondary-pill hero__example"
              disabled={disabled}
              onClick={() => onExample(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
