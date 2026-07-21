export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label htmlFor={htmlFor} className="block text-xs text-n600 mb-1.5">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-red mt-1.5">{error}</p> : hint ? <p className="text-xs text-n600 mt-1.5">{hint}</p> : null}
    </div>
  );
}
