import { Link } from "react-router-dom";
import { PenLine, Key, FileText, Shield, Lock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex-1">
      {/* Hero Section */}
      <section className="py-12 md:py-20">
        <div className="container">
          <div className="flex flex-col items-center text-center space-y-6 max-w-3xl mx-auto">
            <div className="p-4 bg-primary/10 rounded-2xl">
              <PenLine className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Handwriting Assignment Grader
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Create tamper-evident handwriting assignments, assess submissions locally,
              and share verifiable results. No accounts required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button size="lg" asChild>
                <Link to="/keyholder">
                  <Key className="mr-2 h-5 w-5" />
                  Create Assignment
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/about">
                  Learn More
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-12 bg-muted/30">
        <div className="container">
          <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card>
              <CardHeader>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <span className="text-lg font-bold text-primary">1</span>
                </div>
                <CardTitle className="text-lg">Keyholder Creates Assignment</CardTitle>
                <CardDescription>
                  Define required content, style requirements, and digitally sign the assignment
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                The assignment is cryptographically signed, making it tamper-evident. Anyone can
                verify its authenticity.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <span className="text-lg font-bold text-primary">2</span>
                </div>
                <CardTitle className="text-lg">Writer Submits Work</CardTitle>
                <CardDescription>
                  Open the assignment link, upload a photo or scan, and run local assessment
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                All processing happens in your browser. Your images are never uploaded to any
                server.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <span className="text-lg font-bold text-primary">3</span>
                </div>
                <CardTitle className="text-lg">Share Results</CardTitle>
                <CardDescription>
                  Generate an encrypted report link and share it with the keyholder
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Reports are encrypted client-side. The decryption key stays in the URL fragment
                and is never sent to the server.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-12">
        <div className="container">
          <h2 className="text-2xl font-bold text-center mb-10">Key Features</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="flex gap-4 p-4">
              <div className="shrink-0">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">No Accounts Required</h3>
                <p className="text-sm text-muted-foreground">
                  No sign-ups, no passwords. Just create and share links.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4">
              <div className="shrink-0">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Tamper-Evident</h3>
                <p className="text-sm text-muted-foreground">
                  Assignments are cryptographically signed. Any modification is detectable.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4">
              <div className="shrink-0">
                <Eye className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Privacy First</h3>
                <p className="text-sm text-muted-foreground">
                  Image processing happens entirely in your browser.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4">
              <div className="shrink-0">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Encrypted Reports</h3>
                <p className="text-sm text-muted-foreground">
                  Report data is encrypted. Only recipients with the link can view it.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4">
              <div className="shrink-0">
                <PenLine className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Conservative Detection</h3>
                <p className="text-sm text-muted-foreground">
                  Extremely low false positive rate. Uncertain results are clearly marked.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4">
              <div className="shrink-0">
                <Key className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Signature Verification</h3>
                <p className="text-sm text-muted-foreground">
                  Anyone can verify assignment authenticity without special access.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 bg-muted/30">
        <div className="container">
          <div className="flex flex-col items-center text-center space-y-6 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold">Ready to Get Started?</h2>
            <p className="text-muted-foreground">
              Create your first assignment or learn more about how HandwriteCheck works.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" asChild>
                <Link to="/keyholder">
                  <Key className="mr-2 h-5 w-5" />
                  Create Assignment
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/about">About</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
