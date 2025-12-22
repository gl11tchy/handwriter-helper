import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  FileText,
  Loader2,
  ShieldAlert,
  Mail,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ProgressStepper } from "@/components/progress-stepper";
import { AnnotatedViewer } from "@/components/annotated-viewer";
import { FindingsTable } from "@/components/findings-table";
import { ScoreCard } from "@/components/score-card";
import {
  generateEncryptionKey,
  exportKeyToBase64,
  encryptData,
  buildReportUrl,
} from "@/lib/crypto/encryption";
import { runPipeline, type PipelineResult } from "@/lib/pipeline";
import { api } from "@/lib/api";
import type { AssignmentPayload, PipelineProgress, Report, Finding } from "@/types";

type RunnerState =
  | "loading"
  | "invalid"
  | "tampered"
  | "ready"
  | "uploading"
  | "processing"
  | "results"
  | "generating_link";

export default function AssignmentRunner() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<RunnerState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AssignmentPayload | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState("overview");

  const [reportLink, setReportLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  // Countdown timer for due date
  useEffect(() => {
    if (!payload?.dueDate) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const now = new Date().getTime();
      const dueTime = new Date(payload.dueDate!).getTime();
      const diff = dueTime - now;
      const absDiff = Math.abs(diff);

      const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      if (days === 0) parts.push(`${seconds}s`); // Only show seconds if less than a day

      setCountdown(parts.join(" "));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [payload?.dueDate]);

  // Determine if assignment is past due
  const isPastDue = useMemo(() => {
    if (!payload?.dueDate) return false;
    return new Date(payload.dueDate).getTime() < new Date().getTime();
  }, [payload?.dueDate, countdown]); // countdown dependency ensures re-check

  // Fetch assignment from server (with signature verification)
  useEffect(() => {
    const fetchAssignment = async () => {
      if (!assignmentId) {
        setError("No assignment ID found");
        setState("invalid");
        return;
      }

      try {
        const response = await api.getAssignment(assignmentId);
        setPayload(response.payload);
        setState("ready");
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Failed to load assignment";

        // Check if it's a tamper error
        if (errorMessage.includes("modified") || errorMessage.includes("invalid")) {
          setError(errorMessage);
          setState("tampered");
        } else {
          setError(errorMessage);
          setState("invalid");
        }
      }
    };

    fetchAssignment();
  }, [assignmentId]);

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setResult(null);
    setProgress(null);
    setReportLink(null);
    setError(null);
    setEmailSent(false);
    setState("uploading");
  }, []);

  const handleRunPipeline = useCallback(async () => {
    if (!selectedFile || !payload || !assignmentId) return;

    setState("processing");
    setProgress(null);
    setResult(null);
    setError(null);
    setReportLink(null);
    setEmailSent(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const pipelineResult = await runPipeline(selectedFile, payload, {
        onProgress: setProgress,
        signal: controller.signal,
      });

      // Check if aborted after await - ignore stale results
      if (controller.signal.aborted) {
        return;
      }

      setResult(pipelineResult);

      // Auto-generate report link
      setState("generating_link");

      try {
        const report: Report = {
          reportId: "",
          createdAt: new Date().toISOString(),
          assignmentId,
          assignmentPayload: payload,
          inputFile: {
            name: selectedFile.name,
            type: selectedFile.type,
            size: selectedFile.size,
          },
          pages: pipelineResult.pages,
          extractedTextPerLine: pipelineResult.extractedTextPerLine,
          detectedLineCount: pipelineResult.detectedLineCount,
          quality: pipelineResult.quality,
          findings: pipelineResult.findings,
          score: pipelineResult.score,
        };

        const encKey = await generateEncryptionKey();
        const keyB64 = await exportKeyToBase64(encKey);
        const reportJson = JSON.stringify(report);
        const { ciphertextB64, nonceB64 } = await encryptData(reportJson, encKey);

        // Upload to server - only include encryptionKey if email notification is configured
        const { reportId, emailSent: wasEmailSent } = await api.uploadReport({
          ciphertextB64,
          nonceB64,
          meta: {
            createdAt: report.createdAt,
            size: ciphertextB64.length,
          },
          assignmentId,
          // Only send key to server if teacher configured email notification
          ...(payload.notifyEmail && { encryptionKey: keyB64 }),
        });

        const url = buildReportUrl(reportId, keyB64);
        setReportLink(url);
        setEmailSent(wasEmailSent || false);
        setState("results");
      } catch (linkError) {
        // Report link generation failed, but results are available
        setError(linkError instanceof Error ? linkError.message : "Failed to generate report link");
        setState("results");
      }
    } catch (e) {
      // Check if this controller was aborted (not a different one)
      if (controller.signal.aborted) {
        setState("uploading");
        return;
      }
      if (e instanceof Error && e.message === "Pipeline cancelled") {
        setState("uploading");
      } else {
        setError(e instanceof Error ? e.message : "Processing failed");
        setState("uploading"); // Keep file selected so user can retry without re-uploading
      }
    }
  }, [selectedFile, payload, assignmentId]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleRetryReportLink = useCallback(async () => {
    if (!result || !selectedFile || !payload || !assignmentId) return;

    setState("generating_link");
    setError(null);

    try {
      const report: Report = {
        reportId: "",
        createdAt: new Date().toISOString(),
        assignmentId,
        assignmentPayload: payload,
        inputFile: {
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
        },
        pages: result.pages,
        extractedTextPerLine: result.extractedTextPerLine,
        detectedLineCount: result.detectedLineCount,
        quality: result.quality,
        findings: result.findings,
        score: result.score,
      };

      const encKey = await generateEncryptionKey();
      const keyB64 = await exportKeyToBase64(encKey);
      const reportJson = JSON.stringify(report);
      const { ciphertextB64, nonceB64 } = await encryptData(reportJson, encKey);

      // Upload to server - only include encryptionKey if email notification is configured
      const { reportId, emailSent: wasEmailSent } = await api.uploadReport({
        ciphertextB64,
        nonceB64,
        meta: {
          createdAt: report.createdAt,
          size: ciphertextB64.length,
        },
        assignmentId,
        // Only send key to server if teacher configured email notification
        ...(payload.notifyEmail && { encryptionKey: keyB64 }),
      });

      // Build actual report URL with key in fragment
      const url = buildReportUrl(reportId, keyB64);
      setReportLink(url);
      setEmailSent(wasEmailSent || false);
      setState("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report link");
      setState("results");
    }
  }, [result, selectedFile, payload, assignmentId]);

  const copyReportLink = useCallback(async () => {
    if (!reportLink) return;
    try {
      await navigator.clipboard.writeText(reportLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard. Please copy the link manually.");
    }
  }, [reportLink]);

  const resetRunner = useCallback(() => {
    setSelectedFile(null);
    setResult(null);
    setProgress(null);
    setReportLink(null);
    setEmailSent(false);
    setError(null);
    setState("ready");
  }, []);

  const handleFindingClick = useCallback((finding: Finding) => {
    setSelectedFindingId(finding.id);
    setActiveResultTab("viewer");
  }, []);

  if (state === "loading") {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="container py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 bg-destructive/10 rounded-full w-fit">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle>Assignment Not Found</CardTitle>
              <CardDescription>{error || "This assignment doesn't exist or the link is incorrect."}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button asChild>
                <Link to="/">Return Home</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (state === "tampered") {
    return (
      <div className="container py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 bg-destructive/10 rounded-full w-fit">
                <ShieldAlert className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle>Assignment Verification Failed</CardTitle>
              <CardDescription className="text-destructive">
                {error || "This assignment link has been modified or is invalid."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Security Warning</AlertTitle>
                <AlertDescription>
                  This assignment could not be verified. Please request a new link from your teacher.
                </AlertDescription>
              </Alert>
              <div className="flex justify-center">
                <Button asChild>
                  <Link to="/">Return Home</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Assignment Info */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Handwriting Assignment
                </CardTitle>
                <CardDescription>Complete this assignment by uploading your handwritten work</CardDescription>
              </div>
              <div className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="hidden sm:inline">Verified</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {payload && (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Required Lines</p>
                    <p className="font-medium">{payload.requiredLineCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Writing Style</p>
                    <p className="font-medium capitalize">{payload.expectedStyle}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Paper Type</p>
                    <p className="font-medium capitalize">{payload.paperType}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Numbering</p>
                    <p className="font-medium">
                      {payload.numbering.required ? "Required" : "Not required"}
                    </p>
                  </div>
                </div>

                {/* Expected Content */}
                {payload.expectedContent?.lines && payload.expectedContent.lines.length > 0 && (
                  <div className="mt-6 pt-4 border-t">
                    {/* Check if all lines are the same */}
                    {payload.expectedContent.lines.every(line => line === payload.expectedContent.lines[0]) ? (
                      <>
                        <p className="text-sm text-muted-foreground mb-2">
                          Write this line {payload.expectedContent.lines.length} {payload.expectedContent.lines.length === 1 ? "time" : "times"}
                        </p>
                        <p className="font-medium text-base p-3 bg-muted rounded-md">
                          "{payload.expectedContent.lines[0]}"
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground mb-2">Lines to Write</p>
                        <div className="space-y-1 p-3 bg-muted rounded-md max-h-48 overflow-y-auto">
                          {payload.expectedContent.lines.map((line, idx) => (
                            <p key={idx} className="font-medium text-sm">
                              <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                              "{line}"
                            </p>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {payload?.dueDate && countdown && (
              <div className={`flex items-center gap-3 p-3 rounded-lg ${isPastDue ? "bg-destructive/10 border border-destructive/30" : "bg-muted/50"}`}>
                <Clock className={`h-5 w-5 ${isPastDue ? "text-destructive" : "text-primary"}`} />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">
                    {isPastDue ? "Overdue by" : "Due in"}
                  </p>
                  <p className={`font-medium text-lg ${isPastDue ? "text-destructive" : ""}`}>
                    {countdown}
                  </p>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {new Date(payload.dueDate).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Content */}
        {(state === "ready" || state === "uploading") && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Your Work</CardTitle>
              <CardDescription>
                Take a photo or scan of your handwritten assignment and upload it here
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <UploadDropzone
                onFileSelect={handleFileSelect}
              />

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Processing Failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {selectedFile && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={resetRunner}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                  <Button onClick={handleRunPipeline}>
                    <Play className="mr-2 h-4 w-4" />
                    {error ? "Retry Assessment" : "Run Assessment"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {state === "processing" && (
          <Card>
            <CardHeader>
              <CardTitle>Processing</CardTitle>
              <CardDescription>
                Your submission is being analyzed. This may take a moment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProgressStepper progress={progress} />
              <div className="flex justify-end">
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {state === "generating_link" && (
          <Card>
            <CardHeader>
              <CardTitle>Generating Report Link</CardTitle>
              <CardDescription>Encrypting and uploading your results...</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => {
                  setError("Report link generation cancelled");
                  setState("results");
                }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {state === "results" && result && (
          <>
            {/* Score Card */}
            <ScoreCard score={result.score} quality={result.quality} />

            {/* Report Link */}
            {reportLink && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <CardTitle>Report Link Ready</CardTitle>
                  </div>
                  <CardDescription>
                    Share this link with your teacher to view your results
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {emailSent && (
                    <Alert className="bg-green-500/10 border-green-500/50">
                      <Mail className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-600">Email Sent</AlertTitle>
                      <AlertDescription>
                        Your teacher has been notified by email with the report link.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={reportLink}
                      className="flex-1 px-3 py-2 text-sm bg-muted rounded-md font-mono truncate"
                    />
                    <Button onClick={copyReportLink}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" asChild>
                      <a href={reportLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Important</AlertTitle>
                    <AlertDescription>
                      {payload?.notifyEmail
                        ? "The decryption key was shared with the server for email notification. Only people with this link can view the report."
                        : "The decryption key is in the URL fragment and is not sent to the server. Only people with this exact link can view the report."}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Report link generation failed - show retry option */}
            {!reportLink && error && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-destructive" />
                    <CardTitle>Report Link Generation Failed</CardTitle>
                  </div>
                  <CardDescription className="text-destructive">
                    {error}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleRetryReportLink}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Retry Report Link
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Detailed Results */}
            <Card>
              <CardContent className="pt-6">
                <Tabs value={activeResultTab} onValueChange={setActiveResultTab}>
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="findings">
                      Findings ({result.findings.length})
                    </TabsTrigger>
                    <TabsTrigger value="viewer">Viewer</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-4">
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-3 gap-4">
                        <div className="p-4 rounded-lg bg-muted/50">
                          <p className="text-sm text-muted-foreground">Lines Detected</p>
                          <p className="text-2xl font-bold">{result.detectedLineCount}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/50">
                          <p className="text-sm text-muted-foreground">Issues Found</p>
                          <p className="text-2xl font-bold">
                            {result.findings.filter((f) => f.type !== "content_uncertain").length}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/50">
                          <p className="text-sm text-muted-foreground">Confidence Coverage</p>
                          <p className="text-2xl font-bold">
                            {Math.round(result.quality.confidenceCoverage * 100)}%
                          </p>
                        </div>
                      </div>

                      {result.quality.reasons.length > 0 && (
                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Assessment Notes</AlertTitle>
                          <AlertDescription>
                            <ul className="mt-2 space-y-1">
                              {result.quality.reasons.map((reason, i) => (
                                <li key={i}>{reason}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="findings" className="mt-4">
                    <FindingsTable
                      findings={result.findings}
                      onFindingClick={handleFindingClick}
                      selectedFindingId={selectedFindingId}
                    />
                  </TabsContent>

                  <TabsContent value="viewer" className="mt-4">
                    {result.pages.length > 0 && (
                      <div className="h-[500px] border rounded-lg overflow-hidden">
                        <AnnotatedViewer
                          page={result.pages[0]}
                          pageIndex={0}
                          findings={result.findings}
                          selectedFindingId={selectedFindingId}
                          onFindingSelect={(f) => setSelectedFindingId(f?.id || null)}
                          className="h-full"
                        />
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Try Again */}
            <div className="flex justify-center">
              <Button variant="outline" onClick={resetRunner}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Submit Another Photo
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
