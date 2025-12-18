import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Upload,
  Play,
  RotateCcw,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function Create() {
  // ========== CREATE ASSIGNMENT STATE ==========
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
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ========== QUICK GRADE STATE ==========
  const [gradeLineCount, setGradeLineCount] = useState(5);
  const [gradeExpectedLines, setGradeExpectedLines] = useState<string[]>([]);
  const [gradeFile, setGradeFile] = useState<File | null>(null);
  const [gradeProgress, setGradeProgress] = useState<PipelineProgress | null>(null);
  const [gradeResult, setGradeResult] = useState<PipelineResult | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [gradeState, setGradeState] = useState<"input" | "processing" | "results">("input");
  const [reportLink, setReportLink] = useState<string | null>(null);
  const [reportCopied, setReportCopied] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ========== CREATE ASSIGNMENT LOGIC ==========
  useEffect(() => {
    if (lineCount > 0 && expectedLines.length !== lineCount) {
      setExpectedLines(Array(lineCount).fill(""));
    }
  }, [lineCount, expectedLines.length]);

  useEffect(() => {
    if (gradeLineCount > 0 && gradeExpectedLines.length !== gradeLineCount) {
      setGradeExpectedLines(Array(gradeLineCount).fill(""));
    }
  }, [gradeLineCount, gradeExpectedLines.length]);

  const handleGenerateAssignment = async () => {
    setIsGenerating(true);
    setCreateError(null);

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
    setExpectedStyle("print");
    setPaperType("ruled");
    setNumberingRequired(false);
    setNumberingStartAt(1);
    setNumberingFormat("dot");
    setExpectedLines([]);
    setAssignmentId(null);
    setCreateError(null);
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
    if (!gradeFile || gradeExpectedLines.some((l) => !l.trim())) return;

    setGradeState("processing");
    setGradeProgress(null);
    setGradeResult(null);
    setGradeError(null);

    abortControllerRef.current = new AbortController();

    // Build a local assignment payload (not saved to server)
    const localPayload: AssignmentPayload = {
      version: 1,
      assignmentId: `local-${Date.now()}`,
      createdAt: new Date().toISOString(),
      requiredLineCount: gradeLineCount,
      expectedStyle: "print",
      paperType: "either",
      numbering: { required: false },
      expectedContent: { mode: "perLine", lines: gradeExpectedLines },
      precisionMode: "max",
    };

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
  }, [gradeFile, gradeExpectedLines, gradeLineCount]);

  const handleCancelGrade = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleGenerateReportLink = useCallback(async () => {
    if (!gradeResult || !gradeFile) return;

    setIsGeneratingReport(true);
    setGradeError(null);

    try {
      const localPayload: AssignmentPayload = {
        version: 1,
        assignmentId: `local-${Date.now()}`,
        createdAt: new Date().toISOString(),
        requiredLineCount: gradeLineCount,
        expectedStyle: "print",
        paperType: "either",
        numbering: { required: false },
        expectedContent: { mode: "perLine", lines: gradeExpectedLines },
        precisionMode: "max",
      };

      const report: Report = {
        reportId: "",
        createdAt: new Date().toISOString(),
        assignmentId: localPayload.assignmentId,
        assignmentPayload: localPayload,
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
  }, [gradeResult, gradeFile, gradeLineCount, gradeExpectedLines]);

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
  };

  const handleFindingClick = useCallback((finding: Finding) => {
    setSelectedFindingId(finding.id);
  }, []);

  return (
    <div className="container py-8">
      <div className="grid lg:grid-cols-2 gap-8">
        {/* LEFT: Create Assignment */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold">Create Shareable Assignment</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {wizardStep === 1 && "Assignment Rules"}
                {wizardStep === 2 && "Expected Content"}
                {wizardStep === 3 && "Share Link"}
              </CardTitle>
              <CardDescription>
                {wizardStep === 1 && "Define requirements"}
                {wizardStep === 2 && "Enter expected text per line"}
                {wizardStep === 3 && "Share with students"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="lineCount">Lines</Label>
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

                  <div className="flex justify-end pt-2">
                    <Button onClick={() => setWizardStep(2)}>
                      Next
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                    {expectedLines.map((line, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <span className="text-sm text-muted-foreground w-6 pt-2 text-right">
                          {index + 1}.
                        </span>
                        <Textarea
                          value={line}
                          onChange={(e) => {
                            const newLines = [...expectedLines];
                            newLines[index] = e.target.value;
                            setExpectedLines(newLines);
                          }}
                          placeholder={`Line ${index + 1}`}
                          className="min-h-[50px]"
                        />
                      </div>
                    ))}
                  </div>

                  {createError && (
                    <Alert variant="destructive">
                      <AlertDescription>{createError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setWizardStep(1)}>
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleGenerateAssignment}
                      disabled={isGenerating || expectedLines.some((l) => !l.trim())}
                    >
                      {isGenerating ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </div>
              )}

              {wizardStep === 3 && assignmentId && (
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

                  <Button variant="outline" onClick={resetCreateWizard}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Another
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Quick Grade */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold">Quick Grade</h2>

          {gradeState === "input" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Grade Existing Work</CardTitle>
                <CardDescription>Enter expected text and upload handwriting</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Number of Lines</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={gradeLineCount}
                    onChange={(e) => setGradeLineCount(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {gradeExpectedLines.map((line, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <span className="text-sm text-muted-foreground w-6 pt-2 text-right">
                        {index + 1}.
                      </span>
                      <Textarea
                        value={line}
                        onChange={(e) => {
                          const newLines = [...gradeExpectedLines];
                          newLines[index] = e.target.value;
                          setGradeExpectedLines(newLines);
                        }}
                        placeholder={`Line ${index + 1}`}
                        className="min-h-[50px]"
                      />
                    </div>
                  ))}
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
                    disabled={!gradeFile || gradeExpectedLines.some((l) => !l.trim())}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Grade
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {gradeState === "processing" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Processing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ProgressStepper progress={gradeProgress} />
                <div className="flex justify-end">
                  <Button variant="outline" onClick={handleCancelGrade}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {gradeState === "results" && gradeResult && (
            <div className="space-y-4">
              <ScoreCard score={gradeResult.score} quality={gradeResult.quality} />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Findings</CardTitle>
                </CardHeader>
                <CardContent>
                  {gradeResult.findings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No issues found</p>
                  ) : (
                    <FindingsTable
                      findings={gradeResult.findings}
                      onFindingClick={handleFindingClick}
                      selectedFindingId={selectedFindingId}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Report Link Generation */}
              <Card>
                <CardContent className="py-4">
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
                </CardContent>
              </Card>

              <div className="flex justify-center">
                <Button variant="outline" onClick={resetGrade}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Grade Another
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile tabs view */}
      <div className="lg:hidden mt-8">
        <Tabs defaultValue="create">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="grade">Quick Grade</TabsTrigger>
          </TabsList>
          <TabsContent value="create">
            {/* Mobile create content - same as left column */}
          </TabsContent>
          <TabsContent value="grade">
            {/* Mobile grade content - same as right column */}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
