import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  AlertTriangle,
  XCircle,
  Download,
  FileText,
  Loader2,
  Calendar,
  File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnnotatedViewer } from "@/components/annotated-viewer";
import { FindingsTable } from "@/components/findings-table";
import { ScoreCard } from "@/components/score-card";
import { importKeyFromBase64, decryptData, extractKeyFromFragment } from "@/lib/crypto/encryption";
import { api, getApiErrorMessage, isRetryableApiError } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import type { Report, Finding } from "@/types";

type ViewerState = "loading" | "error" | "ready";

// Validate that the decrypted data has required Report fields
function validateReport(data: unknown): Report {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid report format: not an object");
  }

  const report = data as Record<string, unknown>;

  // Check required fields exist
  const requiredFields = [
    "createdAt",
    "assignmentPayload",
    "inputFile",
    "pages",
    "extractedTextPerLine",
    "detectedLineCount",
    "quality",
    "findings",
    "score",
  ];

  for (const field of requiredFields) {
    if (!(field in report)) {
      throw new Error(`Invalid report format: missing "${field}" field`);
    }
  }

  // Validate nested required fields
  const payload = report.assignmentPayload as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid report format: missing assignment payload");
  }
  if (!("expectedContent" in payload) || !("requiredLineCount" in payload)) {
    throw new Error("Invalid report format: incomplete assignment payload");
  }

  const score = report.score as Record<string, unknown> | null;
  if (!score || typeof score !== "object") {
    throw new Error("Invalid report format: missing score data");
  }

  const quality = report.quality as Record<string, unknown> | null;
  if (!quality || typeof quality !== "object") {
    throw new Error("Invalid report format: missing quality data");
  }

  if (!Array.isArray(report.pages)) {
    throw new Error("Invalid report format: pages must be an array");
  }

  if (!Array.isArray(report.findings)) {
    throw new Error("Invalid report format: findings must be an array");
  }

  return data as Report;
}

export default function ReportViewer() {
  const { reportId } = useParams<{ reportId: string }>();
  const [state, setState] = useState<ViewerState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [retryableError, setRetryableError] = useState(false);

  useEffect(() => {
    const loadReport = async () => {
      if (!reportId) {
        setError("No report ID provided");
        setRetryableError(false);
        setState("error");
        return;
      }

      // Extract key from URL fragment
      const keyB64 = extractKeyFromFragment();
      if (!keyB64) {
        setError("No decryption key found in URL");
        setRetryableError(false);
        setState("error");
        return;
      }

      try {
        // Fetch encrypted report
        const { ciphertextB64, nonceB64 } = await api.getReport(reportId);

        // Import decryption key
        const key = await importKeyFromBase64(keyB64);

        // Decrypt report
        const reportJson = await decryptData(ciphertextB64, nonceB64, key);

        // Parse and validate JSON structure
        let parsedData: unknown;
        try {
          parsedData = JSON.parse(reportJson);
        } catch {
          throw new Error("Failed to parse report data");
        }

        // Validate report structure before using
        const reportData = validateReport(parsedData);
        reportData.reportId = reportId;

        setReport(reportData);
        trackEvent("report_viewed", {
          reportId,
          findingsCount: reportData.findings.length,
          totalScore: reportData.score.overall,
        });
        setState("ready");
      } catch (e) {
        console.error("Failed to load report:", e);
        if (e instanceof Error && e.message.includes("decrypt")) {
          setError("Failed to decrypt report. The link may be incomplete or corrupted.");
          setRetryableError(false);
        } else if (e instanceof Error && e.message.includes("Invalid report format")) {
          setError("Report data is corrupted or in an incompatible format.");
          setRetryableError(false);
        } else {
          setError(getApiErrorMessage(e, "Failed to load report"));
          setRetryableError(isRetryableApiError(e));
        }
        setState("error");
      }
    };

    loadReport();
  }, [reportId, loadAttempt]);

  const handleFindingClick = useCallback((finding: Finding) => {
    setSelectedFindingId(finding.id);
    setActiveTab("viewer");
  }, []);

  const handleExportJson = useCallback(() => {
    if (!report) return;

    const exportData = {
      ...report,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${report.reportId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  const retryLoadReport = useCallback(() => {
    setError(null);
    setRetryableError(false);
    setState("loading");
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  if (state === "loading") {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading and decrypting report...</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="container py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 bg-destructive/10 rounded-full w-fit">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle>Unable to Load Report</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>What might have gone wrong:</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li>The link may be incomplete (check if it was truncated)</li>
                    <li>The report may have been deleted</li>
                    <li>The decryption key in the URL may be corrupted</li>
                  </ul>
                </AlertDescription>
              </Alert>
              <Button asChild>
                <Link to="/">Return Home</Link>
              </Button>
              {retryableError && (
                <Button variant="outline" onClick={retryLoadReport}>
                  Retry Load
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="container py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Report Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Assessment Report
                </CardTitle>
                <CardDescription>
                  Handwriting assessment results
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportJson}>
                <Download className="mr-2 h-4 w-4" />
                Export JSON
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Metadata */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium">
                    {new Date(report.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <File className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Original File</p>
                  <p className="font-medium truncate max-w-[150px]" title={report.inputFile.name}>
                    {report.inputFile.name}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Required Lines</p>
                <p className="font-medium">{report.assignmentPayload.requiredLineCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Lines Detected</p>
                <p className="font-medium">{report.detectedLineCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Score Card */}
        <ScoreCard score={report.score} quality={report.quality} />

        {/* Expected Content */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Expected Content</CardTitle>
            <CardDescription>The text that should appear on each line</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {report.assignmentPayload.expectedContent.lines.map((line, index) => (
                <div key={index} className="flex gap-3 text-sm">
                  <span className="text-muted-foreground w-8 text-right">{index + 1}.</span>
                  <span className="flex-1 font-mono bg-muted/50 px-2 py-1 rounded">{line}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detailed Results */}
        <Card>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="findings">
                  Findings ({report.findings.length})
                </TabsTrigger>
                <TabsTrigger value="viewer">Viewer</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Completeness</p>
                      <p className="text-2xl font-bold">{report.score.completeness}%</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Content Accuracy</p>
                      <p className="text-2xl font-bold">{report.score.content}%</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Handwriting Form</p>
                      <p className="text-2xl font-bold">{report.score.handwriting}%</p>
                    </div>
                  </div>

                  {report.quality.reasons.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Assessment Notes</AlertTitle>
                      <AlertDescription>
                        <ul className="mt-2 space-y-1">
                          {report.quality.reasons.map((reason, i) => (
                            <li key={i}>{reason}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Extracted Text Preview */}
                  {report.extractedTextPerLine.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Extracted Text (OCR)</h4>
                      <div className="space-y-1 text-sm max-h-48 overflow-y-auto">
                        {report.extractedTextPerLine.map((line) => (
                          <div key={line.lineIndex} className="flex gap-3">
                            <span className="text-muted-foreground w-8 text-right">
                              {line.lineIndex + 1}.
                            </span>
                            <span className="flex-1 font-mono">
                              {line.text || <span className="text-muted-foreground">(no text)</span>}
                            </span>
                            <span className="text-muted-foreground">
                              {Math.round(line.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="findings" className="mt-4">
                <FindingsTable
                  findings={report.findings}
                  onFindingClick={handleFindingClick}
                  selectedFindingId={selectedFindingId}
                />
              </TabsContent>

              <TabsContent value="viewer" className="mt-4">
                {report.pages.length > 0 && (
                  <div className="h-[500px] border rounded-lg overflow-hidden">
                    <AnnotatedViewer
                      page={report.pages[0]}
                      pageIndex={0}
                      findings={report.findings}
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
      </div>
    </div>
  );
}
