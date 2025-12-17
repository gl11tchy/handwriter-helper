import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Upload,
  Play,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  FileText,
  Loader2,
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
  parseAssignmentToken,
  verifyAssignmentToken,
  decodePayloadUnsafe,
} from "@/lib/crypto/keys";
import {
  generateEncryptionKey,
  exportKeyToBase64,
  encryptData,
  buildReportUrl,
} from "@/lib/crypto/encryption";
import { runPipeline, type PipelineResult } from "@/lib/pipeline";
import { api } from "@/lib/api";
import type { AssignmentPayload, AssignmentToken, PipelineProgress, Report, Finding } from "@/types";

type RunnerState =
  | "loading"
  | "invalid"
  | "ready"
  | "uploading"
  | "processing"
  | "results"
  | "generating_link";

export default function AssignmentRunner() {
  const location = useLocation();
  const abortControllerRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<RunnerState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<AssignmentToken | null>(null);
  const [payload, setPayload] = useState<AssignmentPayload | null>(null);
  const [signatureValid, setSignatureValid] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState("overview");

  const [reportLink, setReportLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Parse token from URL
  useEffect(() => {
    const parseToken = async () => {
      const hash = location.hash;
      if (!hash) {
        setError("No assignment token found in URL");
        setState("invalid");
        return;
      }

      const params = new URLSearchParams(hash.slice(1));
      const tokenStr = params.get("token");

      if (!tokenStr) {
        setError("Invalid URL format");
        setState("invalid");
        return;
      }

      const parsedToken = parseAssignmentToken(tokenStr);
      if (!parsedToken) {
        setError("Could not parse assignment token");
        setState("invalid");
        return;
      }

      setToken(parsedToken);

      // Decode payload (without verifying signature yet)
      const decodedPayload = decodePayloadUnsafe(parsedToken);
      if (!decodedPayload) {
        setError("Could not decode assignment data");
        setState("invalid");
        return;
      }

      setPayload(decodedPayload);

      // Verify signature
      const verification = await verifyAssignmentToken(parsedToken);
      setSignatureValid(verification.valid);

      setState("ready");
    };

    parseToken();
  }, [location.hash]);

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setResult(null);
    setProgress(null);
    setReportLink(null);
    setState("uploading");
  }, []);

  const handleRunPipeline = useCallback(async () => {
    if (!selectedFile || !payload || !token) return;

    setState("processing");
    setProgress(null);
    setResult(null);
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      const pipelineResult = await runPipeline(selectedFile, payload, {
        onProgress: setProgress,
        signal: abortControllerRef.current.signal,
      });

      setResult(pipelineResult);
      setState("results");
    } catch (e) {
      if (e instanceof Error && e.message === "Pipeline cancelled") {
        setState("uploading");
      } else {
        setError(e instanceof Error ? e.message : "Processing failed");
        setState("uploading");
      }
    }
  }, [selectedFile, payload, token]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleGenerateReportLink = useCallback(async () => {
    if (!result || !token || !payload || !selectedFile) return;

    setState("generating_link");
    setError(null);

    try {
      // Create report object
      const report: Report = {
        reportId: "", // Will be assigned by server
        createdAt: new Date().toISOString(),
        assignmentToken: token,
        assignmentPayload: payload,
        assignmentSignatureValid: signatureValid,
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

      // Generate encryption key
      const encKey = await generateEncryptionKey();
      const keyB64 = await exportKeyToBase64(encKey);

      // Encrypt report
      const reportJson = JSON.stringify(report);
      const { ciphertextB64, nonceB64 } = await encryptData(reportJson, encKey);

      // Upload to server
      const { reportId } = await api.uploadReport({
        ciphertextB64,
        nonceB64,
        meta: {
          createdAt: report.createdAt,
          size: ciphertextB64.length,
        },
      });

      // Build report URL with key in fragment
      const url = buildReportUrl(reportId, keyB64);
      setReportLink(url);
      setState("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report link");
      setState("results");
    }
  }, [result, token, payload, selectedFile, signatureValid]);

  const copyReportLink = useCallback(async () => {
    if (!reportLink) return;
    await navigator.clipboard.writeText(reportLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [reportLink]);

  const resetRunner = useCallback(() => {
    setSelectedFile(null);
    setResult(null);
    setProgress(null);
    setReportLink(null);
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
              <CardTitle>Invalid Assignment</CardTitle>
              <CardDescription>{error || "This assignment link is invalid or malformed."}</CardDescription>
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
              <div className="flex items-center gap-2">
                {signatureValid ? (
                  <div className="flex items-center gap-1 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Verified</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-sm text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="hidden sm:inline">Unverified</span>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {payload && (
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
            )}

            {!signatureValid && (
              <Alert variant="warning" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Signature Not Verified</AlertTitle>
                <AlertDescription>
                  This assignment&apos;s signature could not be verified. It may have been modified
                  or created with an untrusted key.
                </AlertDescription>
              </Alert>
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

              {selectedFile && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={resetRunner}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                  <Button onClick={handleRunPipeline}>
                    <Play className="mr-2 h-4 w-4" />
                    Run Assessment
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
            <CardContent>
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            </CardContent>
          </Card>
        )}

        {state === "results" && result && (
          <>
            {/* Score Card */}
            <ScoreCard score={result.score} quality={result.quality} />

            {/* Report Link */}
            {reportLink ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <CardTitle>Report Link Generated</CardTitle>
                  </div>
                  <CardDescription>
                    Share this link with the keyholder to view your results
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={reportLink}
                      className="flex-1 px-3 py-2 text-sm bg-muted rounded-md font-mono"
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
                      The decryption key is in the URL fragment and is not sent to the server. Only
                      people with this exact link can view the report.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">Ready to share your results?</p>
                      <p className="text-sm text-muted-foreground">
                        Generate an encrypted link to share with the keyholder
                      </p>
                    </div>
                    <Button onClick={handleGenerateReportLink}>
                      <Upload className="mr-2 h-4 w-4" />
                      Generate Report Link
                    </Button>
                  </div>
                  {error && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
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
