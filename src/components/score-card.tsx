import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScoreBreakdown, QualityGate } from "@/types";

interface ScoreCardProps {
  score: ScoreBreakdown;
  quality: QualityGate;
  className?: string;
}

function ScoreRing({
  value,
  label,
  size = "md",
}: {
  value: number;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const radius = size === "lg" ? 45 : size === "md" ? 35 : 25;
  const strokeWidth = size === "lg" ? 6 : size === "md" ? 5 : 4;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  const svgSize = (radius + strokeWidth) * 2;
  const center = radius + strokeWidth;

  const getColor = (score: number) => {
    if (score >= 90) return "text-success";
    if (score >= 70) return "text-primary";
    if (score >= 50) return "text-warning";
    return "text-destructive";
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width={svgSize} height={svgSize} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={cn("transition-all duration-500", getColor(value))}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ fontSize: size === "lg" ? "1.5rem" : size === "md" ? "1rem" : "0.75rem" }}
        >
          <span className="font-bold">{Math.round(value)}</span>
        </div>
      </div>
      <span
        className={cn(
          "text-muted-foreground",
          size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-xs"
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function ScoreCard({ score, quality, className }: ScoreCardProps) {
  const getQualityIcon = () => {
    switch (quality.status) {
      case "ok":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "uncertain":
        return <HelpCircle className="h-5 w-5 text-warning" />;
      case "ungradable":
        return <XCircle className="h-5 w-5 text-destructive" />;
    }
  };

  const getQualityLabel = () => {
    switch (quality.status) {
      case "ok":
        return "Assessment Complete";
      case "uncertain":
        return "Partial Assessment";
      case "ungradable":
        return "Unable to Grade";
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Assessment Score</CardTitle>
          <div className="flex items-center gap-2">
            {getQualityIcon()}
            <span
              className={cn(
                "text-sm font-medium",
                quality.status === "ok" && "text-success",
                quality.status === "uncertain" && "text-warning",
                quality.status === "ungradable" && "text-destructive"
              )}
            >
              {getQualityLabel()}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {quality.status === "ungradable" ? (
          <div className="py-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <p className="text-lg font-medium mb-2">Unable to Grade</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {quality.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center justify-around py-4">
            <ScoreRing value={score.overall} label="Overall" size="lg" />
            <div className="flex gap-4">
              <ScoreRing value={score.completeness} label="Complete" size="sm" />
              <ScoreRing value={score.content} label="Content" size="sm" />
              <ScoreRing value={score.handwriting} label="Form" size="sm" />
            </div>
          </div>
        )}

        {quality.status === "uncertain" && quality.reasons.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-1">Notes:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {quality.reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="text-warning">*</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
