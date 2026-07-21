import { Card } from "@/components/ui/Card";

export function PlaceholderNotice({ phase, description }: { phase: number; description: string }) {
  return (
    <Card>
      <div className="p-6 text-sm text-n600 leading-relaxed">
        <p className="mb-1">
          <b className="text-ink font-medium">Coming in phase {phase}.</b>
        </p>
        <p>{description}</p>
      </div>
    </Card>
  );
}
