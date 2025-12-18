import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { HandwritingStyle, PaperType, NumberingFormat } from "@/types";

export default function Create() {
  // Wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [lineCount, setLineCount] = useState(5);
  const [expectedStyle, setExpectedStyle] = useState<HandwritingStyle>("print");
  const [paperType, setPaperType] = useState<PaperType>("ruled");
  const [numberingRequired, setNumberingRequired] = useState(false);
  const [numberingStartAt, setNumberingStartAt] = useState(1);
  const [numberingFormat, setNumberingFormat] = useState<NumberingFormat>("dot");
  const [expectedLines, setExpectedLines] = useState<string[]>([]);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (lineCount > 0 && expectedLines.length !== lineCount) {
      setExpectedLines(Array(lineCount).fill(""));
    }
  }, [lineCount, expectedLines.length]);

  const handleGenerateAssignment = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await api.createAssignment({
        requiredLineCount: lineCount,
        expectedStyle,
        paperType,
        numbering: numberingRequired
          ? { required: true, startAt: numberingStartAt, format: numberingFormat }
          : { required: false },
        expectedContent: { mode: "perLine", lines: expectedLines },
      });

      setAssignmentId(response.assignmentId);
      setWizardStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create assignment");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyAssignmentLink = useCallback(async () => {
    if (!assignmentId) return;
    const url = `${window.location.origin}/a/${assignmentId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [assignmentId]);

  const resetWizard = () => {
    setWizardStep(1);
    setLineCount(5);
    setExpectedStyle("print");
    setPaperType("ruled");
    setNumberingRequired(false);
    setNumberingStartAt(1);
    setNumberingFormat("dot");
    setExpectedLines([]);
    setAssignmentId(null);
    setError(null);
  };

  return (
    <div className="container py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 p-4 bg-primary/10 rounded-full w-fit">
            <PenLine className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Create Assignment</h1>
          <p className="text-muted-foreground">
            Define what students should write and share the link
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {wizardStep === 1 && "Step 1: Assignment Rules"}
              {wizardStep === 2 && "Step 2: Expected Content"}
              {wizardStep === 3 && "Step 3: Share Link"}
            </CardTitle>
            <CardDescription>
              {wizardStep === 1 && "Define the requirements for this assignment"}
              {wizardStep === 2 && "Enter the exact text expected on each line"}
              {wizardStep === 3 && "Copy and share this link with students"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {wizardStep === 1 && (
              <div className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lineCount">Number of Lines</Label>
                    <Input
                      id="lineCount"
                      type="number"
                      min={1}
                      max={50}
                      value={lineCount}
                      onChange={(e) => setLineCount(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Handwriting Style</Label>
                    <Select value={expectedStyle} onValueChange={(v) => setExpectedStyle(v as HandwritingStyle)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="print">Print</SelectItem>
                        <SelectItem value="cursive">Cursive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Paper Type</Label>
                  <Select value={paperType} onValueChange={(v) => setPaperType(v as PaperType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ruled">Ruled Paper</SelectItem>
                      <SelectItem value="blank">Blank Paper</SelectItem>
                      <SelectItem value="either">Either</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Line Numbering Required</Label>
                      <p className="text-sm text-muted-foreground">
                        Require numbered lines (1., 2., etc.)
                      </p>
                    </div>
                    <Switch
                      checked={numberingRequired}
                      onCheckedChange={setNumberingRequired}
                    />
                  </div>

                  {numberingRequired && (
                    <div className="grid sm:grid-cols-2 gap-4 pl-4 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label htmlFor="startAt">Start At</Label>
                        <Input
                          id="startAt"
                          type="number"
                          min={0}
                          value={numberingStartAt}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setNumberingStartAt(isNaN(val) ? 1 : val);
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Format</Label>
                        <Select
                          value={numberingFormat}
                          onValueChange={(v) => setNumberingFormat(v as NumberingFormat)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="dot">1. 2. 3.</SelectItem>
                            <SelectItem value="paren">1) 2) 3)</SelectItem>
                            <SelectItem value="dash">1- 2- 3-</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => setWizardStep(2)}>
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter the exact text that should appear on each line. The system will
                  verify that the handwritten content matches.
                </p>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {expectedLines.map((line, index) => (
                    <div key={index} className="flex gap-3 items-start">
                      <span className="text-sm text-muted-foreground w-8 pt-2 text-right">
                        {index + 1}.
                      </span>
                      <Textarea
                        value={line}
                        onChange={(e) => {
                          const newLines = [...expectedLines];
                          newLines[index] = e.target.value;
                          setExpectedLines(newLines);
                        }}
                        placeholder={`Enter expected text for line ${index + 1}`}
                        className="min-h-[60px]"
                      />
                    </div>
                  ))}
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setWizardStep(1)}>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleGenerateAssignment}
                    disabled={isGenerating || expectedLines.some((l) => !l.trim())}
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Create Assignment
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {wizardStep === 3 && assignmentId && (
              <div className="space-y-6">
                <Alert variant="default" className="bg-green-500/10 border-green-500/50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-600">Assignment Created</AlertTitle>
                  <AlertDescription>
                    Your assignment is ready to share with students.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label>Assignment Link</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}/a/${assignmentId}`}
                      className="font-mono text-xs"
                    />
                    <Button onClick={copyAssignmentLink}>
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share this link with students to complete the assignment
                  </p>
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={resetWizard}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Another
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/">Back to Home</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
