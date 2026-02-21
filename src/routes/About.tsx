import { Link } from "react-router-dom";

export default function About() {
  return (
    <div className="container py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">About</h1>

      <div className="space-y-6 text-sm">
        <section>
          <h2 className="font-semibold mb-2">What this does</h2>
          <p className="text-muted-foreground">
            Checks handwritten work against expected text using OCR.
            Create shareable assignment links or grade submissions directly.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">How processing works</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Uploaded images or PDFs are sent to backend OCR services for grading.</li>
            <li>Google Cloud Vision is used for OCR processing.</li>
            <li>If enabled by deployment settings, uncertain line snippets may be sent to Anthropic Claude for secondary verification.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold mb-2">What's stored</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Encrypted report blobs in Cloudflare R2</li>
            <li>Signed assignment data in Cloudflare R2</li>
          </ul>
          <p className="text-muted-foreground mt-2">
            Reports are encrypted in your browser before upload. In the standard flow, the decryption key stays in the URL fragment and is not sent with report upload.
            If assignment email notifications are enabled, the decryption key is included with report upload so emailed links can open the report.
          </p>
          <p className="text-muted-foreground mt-2">
            Signed assignment payloads and encrypted reports are retained for up to 30 days. Deletion requests are handled manually via support at <span className="font-medium">support@writinglines.com</span>.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Accuracy</h2>
          <p className="text-muted-foreground">
            The system requires high confidence before flagging errors.
            Uncertain results are marked as such rather than penalizing the writer.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Privacy details</h2>
          <p className="text-muted-foreground">
            See <Link to="/privacy" className="underline underline-offset-4">Privacy & Data Handling</Link> for full data-flow details.
          </p>
        </section>
      </div>
    </div>
  );
}
