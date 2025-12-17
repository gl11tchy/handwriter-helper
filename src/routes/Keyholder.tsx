import { useState, useEffect, useCallback } from "react";
import {
  Key,
  Plus,
  Copy,
  Check,
  AlertTriangle,
  Trash2,
  ChevronRight,
  ChevronLeft,
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  generateKeyPair,
  loadKeyPair,
  resetKeyPair,
  signAssignment,
  serializeAssignmentToken,
  parseAssignmentToken,
  verifyAssignmentToken,
} from "@/lib/crypto/keys";
import type {
  AssignmentPayload,
  HandwritingStyle,
  PaperType,
  NumberingFormat,
  KeyholderKeys,
  AssignmentHistoryItem,
} from "@/types";

const HISTORY_KEY = "handwriter-helper-assignment-history";

function loadHistory(): AssignmentHistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: AssignmentHistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

export default function Keyholder() {
  const [keys, setKeys] = useState<KeyholderKeys | null>(null);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState("create");

  // Wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [lineCount, setLineCount] = useState(5);
  const [expectedStyle, setExpectedStyle] = useState<HandwritingStyle>("print");
  const [paperType, setPaperType] = useState<PaperType>("ruled");
  const [numberingRequired, setNumberingRequired] = useState(false);
  const [numberingStartAt, setNumberingStartAt] = useState(1);
  const [numberingFormat, setNumberingFormat] = useState<NumberingFormat>("dot");
  const [expectedLines, setExpectedLines] = useState<string[]>([]);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Verification state
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    payload?: AssignmentPayload;
    error?: string;
  } | null>(null);

  // Reset dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  useEffect(() => {
    loadKeyPair().then((result) => {
      setKeys(result ? { ...result } : null);
      setIsLoadingKeys(false);
    });
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (lineCount > 0 && expectedLines.length !== lineCount) {
      setExpectedLines(Array(lineCount).fill(""));
    }
  }, [lineCount, expectedLines.length]);

  const handleGenerateKeys = async () => {
    setIsLoadingKeys(true);
    try {
      const result = await generateKeyPair();
      setKeys({ ...result, hasPrivateKey: true });
    } finally {
      setIsLoadingKeys(false);
    }
  };

  const handleResetKeys = async () => {
    await resetKeyPair();
    setKeys(null);
    setResetDialogOpen(false);
    setHistory([]);
    saveHistory([]);
  };

  const handleGenerateAssignment = async () => {
    if (!keys) return;

    setIsGenerating(true);
    try {
      const payload: AssignmentPayload = {
        version: 1,
        assignmentId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        requiredLineCount: lineCount,
        expectedStyle,
        paperType,
        numbering: numberingRequired
          ? { required: true, startAt: numberingStartAt, format: numberingFormat }
          : { required: false },
        expectedContent: { mode: "perLine", lines: expectedLines },
        precisionMode: "max",
      };

      const token = await signAssignment(payload);
      const serialized = serializeAssignmentToken(token);
      setGeneratedToken(serialized);

      // Save to history
      const historyItem: AssignmentHistoryItem = {
        assignmentId: payload.assignmentId,
        createdAt: payload.createdAt,
        requiredLineCount: payload.requiredLineCount,
        expectedStyle: payload.expectedStyle,
        token: serialized,
      };
      const newHistory = [historyItem, ...history];
      setHistory(newHistory);
      saveHistory(newHistory);

      setWizardStep(3);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyAssignmentLink = useCallback(async () => {
    if (!generatedToken) return;
    const url = `${window.location.origin}/a#token=${generatedToken}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedToken]);

  const handleVerify = async () => {
    if (!verifyInput.trim()) {
      setVerifyResult({ valid: false, error: "Please enter a token or URL" });
      return;
    }

    try {
      // Extract token from URL or use directly
      let tokenStr = verifyInput.trim();
      if (tokenStr.includes("#token=")) {
        tokenStr = tokenStr.split("#token=")[1];
      }

      const token = parseAssignmentToken(tokenStr);
      if (!token) {
        setVerifyResult({ valid: false, error: "Invalid token format" });
        return;
      }

      const result = await verifyAssignmentToken(token);
      if (result.valid && result.payload) {
        setVerifyResult({ valid: true, payload: result.payload });
      } else {
        setVerifyResult({ valid: false, error: "Signature verification failed" });
      }
    } catch (e) {
      setVerifyResult({
        valid: false,
        error: e instanceof Error ? e.message : "Verification failed",
      });
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setLineCount(5);
    setExpectedStyle("print");
    setPaperType("ruled");
    setNumberingRequired(false);
    setExpectedLines([]);
    setGeneratedToken(null);
  };

  if (isLoadingKeys) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (!keys) {
    return (
      <div className="container py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 bg-primary/10 rounded-full w-fit">
                <Key className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Initialize Keyholder</CardTitle>
              <CardDescription>
                Generate a cryptographic keypair to sign assignments. Your private key will be
                stored securely in your browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  Your private key is stored in this browser only. If you clear browser data or use
                  a different browser, you will need to generate new keys.
                </AlertDescription>
              </Alert>
              <Button size="lg" onClick={handleGenerateKeys}>
                <Key className="mr-2 h-5 w-5" />
                Generate Keypair
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Keyholder Dashboard</h1>
            <p className="text-muted-foreground">Create and manage assignments</p>
          </div>
          <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset Keys
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Keyholder Keys?</DialogTitle>
                <DialogDescription>
                  This will delete your current keypair and all assignment history. Previously
                  created assignments will still be verifiable, but you won&apos;t be able to create
                  new assignments with the same signature.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleResetKeys}>
                  Reset Keys
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="create">
              <Plus className="mr-2 h-4 w-4" />
              Create Assignment
            </TabsTrigger>
            <TabsTrigger value="history">
              <FileText className="mr-2 h-4 w-4" />
              History ({history.length})
            </TabsTrigger>
            <TabsTrigger value="verify">
              <Check className="mr-2 h-4 w-4" />
              Verify
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  {wizardStep === 1 && "Step 1: Assignment Rules"}
                  {wizardStep === 2 && "Step 2: Expected Content"}
                  {wizardStep === 3 && "Step 3: Assignment Link"}
                </CardTitle>
                <CardDescription>
                  {wizardStep === 1 && "Define the requirements for this assignment"}
                  {wizardStep === 2 && "Enter the exact text expected on each line"}
                  {wizardStep === 3 && "Copy and share this link with writers"}
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
                              onChange={(e) => setNumberingStartAt(parseInt(e.target.value) || 1)}
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
                      Enter the exact text that should appear on each line. The assessment will
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
                            Generating...
                          </>
                        ) : (
                          <>
                            Generate Assignment
                            <ChevronRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && generatedToken && (
                  <div className="space-y-6">
                    <Alert variant="default" className="bg-success/10 border-success/50">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <AlertTitle className="text-success">Assignment Created</AlertTitle>
                      <AlertDescription>
                        Your assignment has been signed and is ready to share.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      <Label>Assignment Link</Label>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={`${window.location.origin}/a#token=${generatedToken}`}
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
                        Share this link with writers to complete the assignment
                      </p>
                    </div>

                    <div className="flex justify-between pt-4">
                      <Button variant="outline" onClick={resetWizard}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Another
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Assignment History</CardTitle>
                <CardDescription>Previously created assignments from this browser</CardDescription>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No assignments created yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map((item) => (
                      <div
                        key={item.assignmentId}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {item.requiredLineCount} lines - {item.expectedStyle}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              const url = `${window.location.origin}/a#token=${item.token}`;
                              await navigator.clipboard.writeText(url);
                            }}
                            title="Copy link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const newHistory = history.filter(
                                (h) => h.assignmentId !== item.assignmentId
                              );
                              setHistory(newHistory);
                              saveHistory(newHistory);
                            }}
                            title="Remove from history"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="verify" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Verify Assignment</CardTitle>
                <CardDescription>
                  Paste an assignment link or token to verify its authenticity
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="verifyInput">Assignment Link or Token</Label>
                  <Textarea
                    id="verifyInput"
                    value={verifyInput}
                    onChange={(e) => {
                      setVerifyInput(e.target.value);
                      setVerifyResult(null);
                    }}
                    placeholder="Paste the assignment link or token here..."
                    className="font-mono text-xs"
                  />
                </div>
                <Button onClick={handleVerify} disabled={!verifyInput.trim()}>
                  <Check className="mr-2 h-4 w-4" />
                  Verify
                </Button>

                {verifyResult && (
                  <div className="mt-4">
                    {verifyResult.valid ? (
                      <Alert variant="default" className="bg-success/10 border-success/50">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <AlertTitle className="text-success">Valid Signature</AlertTitle>
                        <AlertDescription>
                          <div className="mt-2 space-y-1 text-sm">
                            <p>
                              <strong>Lines:</strong> {verifyResult.payload?.requiredLineCount}
                            </p>
                            <p>
                              <strong>Style:</strong> {verifyResult.payload?.expectedStyle}
                            </p>
                            <p>
                              <strong>Created:</strong>{" "}
                              {verifyResult.payload?.createdAt
                                ? new Date(verifyResult.payload.createdAt).toLocaleString()
                                : "Unknown"}
                            </p>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertTitle>Invalid</AlertTitle>
                        <AlertDescription>{verifyResult.error}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
