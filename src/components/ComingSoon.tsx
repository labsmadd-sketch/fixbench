interface Props {
  title: string;
  phase: string;
  points: string[];
}

/** Placeholder for screens built in later roadmap phases. Matches the design canvas. */
export function ComingSoon({ title, phase, points }: Props) {
  return (
    <section className="stack">
      <h1 className="h1">{title}</h1>
      <div className="card stack">
        <span className="badge">{phase}</span>
        <ul className="list">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
