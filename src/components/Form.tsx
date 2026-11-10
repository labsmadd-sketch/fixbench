import type { ReactNode } from 'react';

export function ErrorAlert({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="alert alert--error" role="alert">
      {error}
    </div>
  );
}

export function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>
        {label} {optional && <span className="opt">(optional)</span>}
      </label>
      {children}
      {error ? (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'FB';
