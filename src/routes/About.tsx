import { Link } from "react-router-dom";
import {
  Shield,
  Lock,
  Eye,
  Server,
  Key,
  FileText,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function About() {
  return (
    <div className="container py-8 max-w-4xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">About Handwriter Helper</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A privacy-focused, client-side handwriting assignment grader with tamper-evident
            assignments and encrypted reports.
          </p>
        </div>

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Key className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">1. Keyholder Creates Assignment</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  A keyholder (teacher, parent, etc.) creates an assignment specifying the expected
                  content, number of lines, and writing style. The assignment is cryptographically
                  signed using keys stored in the browser, creating a tamper-evident record.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">2. Writer Completes Assignment</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  The writer opens the assignment link, takes a photo or scan of their handwritten
                  work, and uploads it. The image is processed entirely in the browser using OCR
                  and image analysis. No images are ever uploaded to any server.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">3. Encrypted Report Sharing</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Results are encrypted client-side before being uploaded. The decryption key is
                  placed in the URL fragment (after the #) and is never sent to the server. Only
                  someone with the complete link can view the report.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Privacy */}
        <Card id="privacy">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy Statement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold">Client-Side Processing</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  All image processing, OCR, and analysis happens in your browser. Your handwriting
                  images are never uploaded to any server.
                </p>
              </div>

              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold">End-to-End Encryption</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Reports are encrypted before upload. The server only stores encrypted blobs and
                  cannot read your data.
                </p>
              </div>

              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold">Minimal Server Storage</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  We only store encrypted report blobs. No accounts, no profiles, no tracking.
                </p>
              </div>

              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold">Key in URL Fragment</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  The decryption key stays in the URL fragment (#) and is never sent to the server.
                  Only people you share the link with can view reports.
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <h4 className="font-semibold">What we store:</h4>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Encrypted report blobs (unreadable without the key)</li>
                <li>Report metadata: creation timestamp and size</li>
              </ul>
            </div>

            <div className="space-y-2 text-sm">
              <h4 className="font-semibold">What we do NOT store or see:</h4>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Your original images</li>
                <li>Your handwriting</li>
                <li>Decryption keys</li>
                <li>Personal information or accounts</li>
                <li>Keyholder private keys (stored only in your browser)</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Detection Accuracy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Detection Accuracy
            </CardTitle>
            <CardDescription>
              Handwriter Helper is designed to minimize false positives
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We prioritize accuracy over catching every possible error. This means:
            </p>

            <div className="grid gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-success/10">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-success">High Confidence Required</h4>
                  <p className="text-sm text-muted-foreground">
                    Errors are only flagged when the system has extremely high confidence. Uncertain
                    results are clearly marked as such.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10">
                <HelpCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-warning">Uncertain Results</h4>
                  <p className="text-sm text-muted-foreground">
                    When OCR confidence is low or image quality is poor, results are marked as
                    &ldquo;uncertain&rdquo; rather than penalizing the writer.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold">Ungradable Submissions</h4>
                  <p className="text-sm text-muted-foreground">
                    If image quality is too poor or too many lines cannot be verified, the
                    submission is marked as &ldquo;ungradable&rdquo; with a recommendation to retake
                    the photo.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technical Details */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-1">Cryptographic Signatures</h4>
              <p className="text-muted-foreground">
                Assignments are signed using ECDSA with the P-256 curve via the Web Crypto API.
                The public key is included in the assignment token, allowing anyone to verify
                authenticity without needing access to the keyholder&apos;s private key.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-1">Report Encryption</h4>
              <p className="text-muted-foreground">
                Reports are encrypted using AES-256-GCM via the Web Crypto API. The encryption key
                is generated client-side and placed in the URL fragment, which browsers do not send
                to servers.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-1">Image Processing</h4>
              <p className="text-muted-foreground">
                All image analysis runs in the browser. The pipeline includes image quality
                assessment, line detection, and text recognition to verify content matches the
                expected assignment.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Button asChild>
            <Link to="/keyholder">
              <Key className="mr-2 h-5 w-5" />
              Create Assignment
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Return Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
