import { AlertCircle, AlertTriangle, HelpCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Finding, FindingType } from "@/types";

const FINDING_CONFIG: Record<
  FindingType,
  { label: string; icon: typeof AlertCircle; severity: "error" | "warning" | "info" }
> = {
  content_mismatch: {
    label: "Content Mismatch",
    icon: AlertCircle,
    severity: "error",
  },
  content_uncertain: {
    label: "Content Uncertain",
    icon: HelpCircle,
    severity: "info",
  },
  missing_i_dot: {
    label: "Missing i Dot",
    icon: AlertTriangle,
    severity: "warning",
  },
  uncrossed_t: {
    label: "Uncrossed t",
    icon: AlertTriangle,
    severity: "warning",
  },
  numbering_error: {
    label: "Numbering Error",
    icon: FileText,
    severity: "warning",
  },
};

interface FindingsTableProps {
  findings: Finding[];
  onFindingClick?: (finding: Finding) => void;
  selectedFindingId?: string | null;
  className?: string;
}

export function FindingsTable({
  findings,
  onFindingClick,
  selectedFindingId,
  className,
}: FindingsTableProps) {
  if (findings.length === 0) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        No findings detected
      </div>
    );
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Issue</th>
            <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Line</th>
            <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Details</th>
            <th className="text-right px-4 py-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {findings.map((finding) => {
            const config = FINDING_CONFIG[finding.type];
            const Icon = config.icon;
            const isSelected = selectedFindingId === finding.id;

            return (
              <tr
                key={finding.id}
                className={cn(
                  "transition-colors",
                  onFindingClick && "cursor-pointer hover:bg-muted/50",
                  isSelected && "bg-primary/10"
                )}
                onClick={() => onFindingClick?.(finding)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        config.severity === "error" && "text-destructive",
                        config.severity === "warning" && "text-warning",
                        config.severity === "info" && "text-muted-foreground"
                      )}
                    />
                    <span className="font-medium">{config.label}</span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                  {finding.lineIndex !== undefined ? `Line ${finding.lineIndex + 1}` : "-"}
                </td>
                <td className="px-4 py-3 hidden md:table-cell max-w-xs truncate text-muted-foreground">
                  {finding.message}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                      finding.confidence >= 0.9 && "bg-destructive/10 text-destructive",
                      finding.confidence >= 0.7 &&
                        finding.confidence < 0.9 &&
                        "bg-warning/10 text-warning",
                      finding.confidence < 0.7 && "bg-muted text-muted-foreground"
                    )}
                  >
                    {Math.round(finding.confidence * 100)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
