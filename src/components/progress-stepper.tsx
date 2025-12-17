import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { PipelineStep, PipelineProgress } from "@/types";

const PIPELINE_STEPS: { step: PipelineStep; label: string }[] = [
  { step: "load", label: "Loading file" },
  { step: "preprocess", label: "Preprocessing" },
  { step: "detect_lines", label: "Detecting lines" },
  { step: "ocr", label: "Text recognition" },
  { step: "verify_content", label: "Verifying content" },
  { step: "check_handwriting", label: "Checking handwriting" },
  { step: "quality_gate", label: "Quality check" },
  { step: "score", label: "Scoring" },
];

interface ProgressStepperProps {
  progress: PipelineProgress | null;
  className?: string;
}

export function ProgressStepper({ progress, className }: ProgressStepperProps) {
  if (!progress) {
    return null;
  }

  const currentStepIndex = PIPELINE_STEPS.findIndex((s) => s.step === progress.step);
  const isComplete = progress.step === "complete";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{progress.message}</span>
        <span className="text-muted-foreground">
          {isComplete ? "Complete" : `${Math.round(progress.progress * 100)}%`}
        </span>
      </div>

      <Progress value={progress.progress * 100} />

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {PIPELINE_STEPS.map((item, index) => {
          const isActive = index === currentStepIndex && !isComplete;
          const isCompleted = index < currentStepIndex || isComplete;

          return (
            <div
              key={item.step}
              className="flex flex-col items-center gap-1"
              title={item.label}
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
                  isCompleted && "bg-primary text-primary-foreground",
                  isActive && "bg-primary/20 text-primary",
                  !isCompleted && !isActive && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : isActive ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
              </div>
              <span
                className={cn(
                  "text-xs text-center hidden sm:block",
                  isCompleted && "text-foreground",
                  isActive && "text-primary font-medium",
                  !isCompleted && !isActive && "text-muted-foreground"
                )}
              >
                {item.label.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
