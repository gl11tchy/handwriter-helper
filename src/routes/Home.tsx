import { useState, useCallback, useRef } from "react";
import { PenLine, Plus, Copy, Check, ChevronRight, CheckCircle2, Upload, Play, RotateCcw, ExternalLink, AlertTriangle, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { runPipeline, type PipelineResult } from "@/lib/pipeline";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ProgressStepper } from "@/components/progress-stepper";
import { ScoreCard } from "@/components/score-card";
import { FindingsTable } from "@/components/findings-table";
import {
  generateEncryptionKey,
  exportKeyToBase64,
  encryptData,
  buildReportUrl,
} from "@/lib/crypto/encryption";
import type { HandwritingStyle, PaperType, NumberingFormat, AssignmentPayload, PipelineProgress, Report, Finding } from "@/types";

export default function Home() {
  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);

  // ========== CREATE ASSIGNMENT STATE ==========
  const [wizardStep, setWizardStep] = useState(1);
  const [lineCount, setLineCount] = useState(5);
  const [expectedText, setExpectedText] = useState("");
  const [expectedStyle, setExpectedStyle] = useState<HandwritingStyle>("print");
  const [paperType, setPaperType] = useState<PaperType>("ruled");
  const [numberingRequired, setNumberingRequired] = useState(false);
  const [numberingStartAt, setNumberingStartAt] = useState(1);
  const [numberingFormat, setNumberingFormat] = useState<NumberingFormat>("dot");
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ========== QUICK GRADE STATE ==========
  const [gradeLineCount, setGradeLineCount] = useState(5);
  const [gradeExpectedText, setGradeExpectedText] = useState("");
  const [gradeFile, setGradeFile] = useState<File | null>(null);
  const [gradeProgress, setGradeProgress] = useState<PipelineProgress | null>(null);
  const [gradeResult, setGradeResult] = useState<PipelineResult | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [gradeState, setGradeState] = useState<"input" | "processing" | "results">("input");
  const [reportLink, setReportLink] = useState<string | null>(null);
  const [reportCopied, setReportCopied] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [gradedPayload, setGradedPayload] = useState<AssignmentPayload | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ========== CREATE ASSIGNMENT LOGIC ==========
  const handleGenerateAssignment = async () => {
    setIsGenerating(true);
    setCreateError(null);

    try {
      const lines = Array(lineCount).fill(expectedText);
      const response = await api.createAssignment({
        requiredLineCount: lineCount,
        expectedStyle,
        paperType,
        numbering: numberingRequired
          ? { required: true, startAt: numberingStartAt, format: numberingFormat }
          : { required: false },
        expectedContent: { mode: "perLine", lines },
      });

      setAssignmentId(response.assignmentId);
      setWizardStep(2);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create assignment");
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

  const resetCreateWizard = () => {
    setWizardStep(1);
    setLineCount(5);
    setExpectedText("");
    setExpectedStyle("print");
    setPaperType("ruled");
    setNumberingRequired(false);
    setNumberingStartAt(1);
    setNumberingFormat("dot");
    setAssignmentId(null);
    setCreateError(null);
  };

  const handleCreateModalClose = (open: boolean) => {
    // Prevent closing while async operation is in flight
    if (!open && isGenerating) return;
    if (!open) {
      resetCreateWizard();
    }
    setCreateModalOpen(open);
  };

  // ========== QUICK GRADE LOGIC ==========
  const handleFileSelect = useCallback((file: File) => {
    setGradeFile(file);
    setGradeResult(null);
    setGradeProgress(null);
    setReportLink(null);
    setGradeError(null);
  }, []);

  const handleRunGrade = useCallback(async () => {
    if (!gradeFile || !gradeExpectedText.trim()) return;

    setGradeState("processing");
    setGradeProgress(null);
    setGradeResult(null);
    setGradeError(null);

    abortControllerRef.current = new AbortController();

    const lines = Array(gradeLineCount).fill(gradeExpectedText);
    const localPayload: AssignmentPayload = {
      version: 1,
      assignmentId: `local-${Date.now()}`,
      createdAt: new Date().toISOString(),
      requiredLineCount: gradeLineCount,
      expectedStyle: "print",
      paperType: "either",
      numbering: { required: false },
      expectedContent: { mode: "perLine", lines },
      precisionMode: "max",
    };

    setGradedPayload(localPayload);

    try {
      const result = await runPipeline(gradeFile, localPayload, {
        onProgress: setGradeProgress,
        signal: abortControllerRef.current.signal,
      });

      setGradeResult(result);
      setGradeState("results");
    } catch (e) {
      if (e instanceof Error && e.message === "Pipeline cancelled") {
        setGradeState("input");
      } else {
        setGradeError(e instanceof Error ? e.message : "Grading failed");
        setGradeState("input");
      }
    }
  }, [gradeFile, gradeExpectedText, gradeLineCount]);

  const handleCancelGrade = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleGenerateReportLink = useCallback(async () => {
    if (!gradeResult || !gradeFile || !gradedPayload) return;

    setIsGeneratingReport(true);
    setGradeError(null);

    try {
      const report: Report = {
        reportId: "",
        createdAt: new Date().toISOString(),
        assignmentId: gradedPayload.assignmentId,
        assignmentPayload: gradedPayload,
        inputFile: {
          name: gradeFile.name,
          type: gradeFile.type,
          size: gradeFile.size,
        },
        pages: gradeResult.pages,
        extractedTextPerLine: gradeResult.extractedTextPerLine,
        detectedLineCount: gradeResult.detectedLineCount,
        quality: gradeResult.quality,
        findings: gradeResult.findings,
        score: gradeResult.score,
      };

      const encKey = await generateEncryptionKey();
      const keyB64 = await exportKeyToBase64(encKey);
      const reportJson = JSON.stringify(report);
      const { ciphertextB64, nonceB64 } = await encryptData(reportJson, encKey);

      const { reportId } = await api.uploadReport({
        ciphertextB64,
        nonceB64,
        meta: {
          createdAt: report.createdAt,
          size: ciphertextB64.length,
        },
      });

      const url = buildReportUrl(reportId, keyB64);
      setReportLink(url);
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : "Failed to generate report link");
    } finally {
      setIsGeneratingReport(false);
    }
  }, [gradeResult, gradeFile, gradedPayload]);

  const copyReportLink = useCallback(async () => {
    if (!reportLink) return;
    await navigator.clipboard.writeText(reportLink);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 2000);
  }, [reportLink]);

  const resetGrade = () => {
    setGradeFile(null);
    setGradeResult(null);
    setGradeProgress(null);
    setReportLink(null);
    setGradeError(null);
    setGradeState("input");
    setSelectedFindingId(null);
    setGradedPayload(null);
    setGradeExpectedText("");
    setGradeLineCount(5);
  };

  const handleGradeModalClose = (open: boolean) => {
    // Prevent closing while async operations are in flight
    const busy = gradeState === "processing" || isGeneratingReport;
    if (!open && busy) return;
    if (!open) {
      resetGrade();
    }
    setGradeModalOpen(open);
  };

  const handleFindingClick = useCallback((finding: Finding) => {
    setSelectedFindingId(finding.id);
  }, []);

  return (
    <div className="flex-1">
      <section className="py-20 md:py-32">
        <div className="container">
          <div className="flex flex-col items-center text-center space-y-6 max-w-3xl mx-auto">
            <div className="p-4 bg-primary/10 rounded-2xl">
              <PenLine className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Handwriting Assignment Grader
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Create an assignment or grade an existing one. Our handwriting detection software analyzes the work and generates a detailed report.
            </p>
            <div className="flex gap-4 pt-4">
              <Button size="lg" onClick={() => setCreateModalOpen(true)}>
                <Plus className="mr-2 h-5 w-5" />
                Create Assignment
              </Button>
              <Button size="lg" variant="outline" onClick={() => setGradeModalOpen(true)}>
                <FileCheck className="mr-2 h-5 w-5" />
                Quick Grade
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Create Assignment Modal */}
      <Dialog open={createModalOpen} onOpenChange={handleCreateModalClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {wizardStep === 1 && "Create Assignment"}
              {wizardStep === 2 && "Share Link"}
            </DialogTitle>
            <DialogDescription>
              {wizardStep === 1 && "Enter the text and how many times it should be written"}
              {wizardStep === 2 && "Share this link with students"}
            </DialogDescription>
          </DialogHeader>

          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Expected Text</Label>
                <Textarea
                  value={expectedText}
                  onChange={(e) => setExpectedText(e.target.value)}
                  placeholder="e.g., I will not talk in class"
                  className="min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lineCount">Repeat Times</Label>
                  <Input
                    id="lineCount"
                    type="number"
                    min={1}
                    max={500}
                    value={lineCount}
                    onChange={(e) => setLineCount(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Style</Label>
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
                <Label>Paper</Label>
                <Select value={paperType} onValueChange={(v) => setPaperType(v as PaperType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ruled">Ruled</SelectItem>
                    <SelectItem value="blank">Blank</SelectItem>
                    <SelectItem value="either">Either</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label>Line Numbering</Label>
                <Switch
                  checked={numberingRequired}
                  onCheckedChange={setNumberingRequired}
                />
              </div>

              {numberingRequired && (
                <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-muted">
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

              {createError && (
                <Alert variant="destructive">
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleGenerateAssignment}
                  disabled={isGenerating || !expectedText.trim()}
                >
                  {isGenerating ? "Creating..." : "Create"}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {wizardStep === 2 && assignmentId && (
            <div className="space-y-4">
              <Alert variant="default" className="bg-green-500/10 border-green-500/50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-600">Created</AlertTitle>
              </Alert>

              <div className="space-y-2">
                <Label>Link</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/a/${assignmentId}`}
                    className="font-mono text-xs"
                  />
                  <Button onClick={copyAssignmentLink}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button variant="outline" onClick={resetCreateWizard} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Create Another
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick Grade Modal */}
      <Dialog open={gradeModalOpen} onOpenChange={handleGradeModalClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {gradeState === "input" && "Quick Grade"}
              {gradeState === "processing" && "Processing"}
              {gradeState === "results" && "Results"}
            </DialogTitle>
            <DialogDescription>
              {gradeState === "input" && "Enter expected text and upload handwriting to grade"}
              {gradeState === "processing" && "Analyzing handwriting..."}
              {gradeState === "results" && "Grading complete"}
            </DialogDescription>
          </DialogHeader>

          {gradeState === "input" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Expected Text</Label>
                <Textarea
                  value={gradeExpectedText}
                  onChange={(e) => setGradeExpectedText(e.target.value)}
                  placeholder="e.g., I will not talk in class"
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Number of Lines</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={gradeLineCount}
                  onChange={(e) => setGradeLineCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <UploadDropzone onFileSelect={handleFileSelect} />

              {gradeFile && (
                <div className="text-sm text-muted-foreground">
                  Selected: {gradeFile.name}
                </div>
              )}

              {gradeError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{gradeError}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={handleRunGrade}
                  disabled={!gradeFile || !gradeExpectedText.trim()}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Grade
                </Button>
              </div>
            </div>
          )}

          {gradeState === "processing" && (
            <div className="space-y-4">
              <ProgressStepper progress={gradeProgress} />
              <div className="flex justify-end">
                <Button variant="outline" onClick={handleCancelGrade}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {gradeState === "results" && gradeResult && (
            <div className="space-y-4">
              <ScoreCard score={gradeResult.score} quality={gradeResult.quality} />

              <div className="space-y-2">
                <Label className="text-sm font-medium">Findings</Label>
                {gradeResult.findings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No issues found</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto">
                    <FindingsTable
                      findings={gradeResult.findings}
                      onFindingClick={handleFindingClick}
                      selectedFindingId={selectedFindingId}
                    />
                  </div>
                )}
              </div>

              {/* Report Link Generation */}
              <div className="space-y-3 pt-2 border-t">
                {gradeError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{gradeError}</AlertDescription>
                  </Alert>
                )}
                {reportLink ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Report link generated
                    </div>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={reportLink}
                        className="font-mono text-xs"
                      />
                      <Button onClick={copyReportLink}>
                        {reportCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" asChild>
                        <a href={reportLink} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Save results?</span>
                    <Button onClick={handleGenerateReportLink} disabled={isGeneratingReport}>
                      <Upload className="mr-2 h-4 w-4" />
                      {isGeneratingReport ? "Generating..." : "Generate Report Link"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={resetGrade}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Grade Another
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
