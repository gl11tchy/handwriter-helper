export default function About() {
  return (
    <div className="container py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">About</h1>

      <div className="space-y-6 text-sm">
        <section>
          <h2 className="font-semibold mb-2">What this does</h2>
          <p className="text-muted-foreground">
            Checks handwritten work against expected text using OCR.
            Teachers can create shareable assignment links or grade papers directly.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Privacy</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Images are processed in your browser, not uploaded</li>
            <li>Reports are encrypted before storage</li>
            <li>Decryption keys stay in the URL (never sent to server)</li>
            <li>No accounts or tracking</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold mb-2">What's stored</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Encrypted report blobs</li>
            <li>Signed assignment data</li>
          </ul>
          <p className="text-muted-foreground mt-2">
            We cannot read your reports or see your images.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Accuracy</h2>
          <p className="text-muted-foreground">
            The system requires high confidence before flagging errors.
            Uncertain results are marked as such rather than penalizing the writer.
          </p>
        </section>
      </div>
    </div>
  );
}
