// Single-select reason chip (design/ui-draft.html's Reconcile screen). The
// prototype's own chip is a small pill (5px/10px padding); SPEC.md's phase 6
// quality bar requires a 44px minimum touch target here specifically (this
// screen is used right after counting, often on a phone), so height is
// bumped well past the prototype's literal pixels while keeping the same
// pill shape and on/off treatment.
export function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 px-3.5 rounded-full border text-[13px] disabled:opacity-50 ${
        active ? "bg-teal border-teal text-white" : "bg-white border-n200 text-ink hover:border-n400"
      }`}
    >
      {children}
    </button>
  );
}
