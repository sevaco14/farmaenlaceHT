export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={["wordmark", className].filter(Boolean).join(" ")} role="img" aria-label="Farmaenlace">
      <span className="wordmark-farma" aria-hidden="true">
        farma
      </span>
      <span className="wordmark-enlace" aria-hidden="true">
        enlace
      </span>
      <svg className="wordmark-swoosh" viewBox="0 0 200 24" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 9 C 52 25, 128 24, 200 2 C 132 19, 56 19, 0 4 Z" />
      </svg>
    </span>
  );
}
