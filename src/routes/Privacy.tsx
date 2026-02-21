import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="container py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Privacy & Data Handling</h1>

      <div className="space-y-6 text-sm">
        <section>
          <h2 className="font-semibold mb-2">What this app does</h2>
          <p className="text-muted-foreground">
            Writing Lines creates handwriting assignments, grades uploaded handwriting, and generates
            encrypted shareable reports.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">What is processed</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Uploaded images or PDFs are sent to backend OCR services for grading.</li>
            <li>Google Cloud Vision is used for OCR processing.</li>
            <li>If enabled by deployment settings, uncertain line snippets may be sent to Anthropic Claude for secondary verification.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold mb-2">What is stored</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Signed assignment payloads in Cloudflare R2.</li>
            <li>Encrypted report blobs in Cloudflare R2.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Encryption model</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Reports are encrypted in your browser before upload.</li>
            <li>In the standard flow, the decryption key stays in the URL fragment and is not sent with report upload.</li>
            <li>If assignment email notifications are enabled, the decryption key is included with report upload only so the backend can send a usable emailed report link; stored report blobs remain encrypted.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Retention and deletion</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Signed assignment payloads and encrypted reports are retained for up to 30 days.</li>
            <li>After 30 days, stored artifacts should be removed as part of routine cleanup operations.</li>
            <li>Deletion requests are handled manually via support at <span className="font-medium">support@writinglines.com</span>.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Current limits</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>No self-service data deletion UI is currently provided.</li>
            <li>No in-app account system controls assignment/report access for public links.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Related pages</h2>
          <p className="text-muted-foreground">
            See <Link to="/about" className="underline underline-offset-4">About</Link> for a product overview.
          </p>
        </section>
      </div>
    </div>
  );
}
