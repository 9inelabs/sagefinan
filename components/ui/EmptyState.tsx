export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink mb-1">{title}</p>
      <p className="text-sm text-n600 mb-4">{description}</p>
      {action}
    </div>
  );
}
