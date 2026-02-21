export default function Privacy() {
  return (
    <div className="container py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Privacy</h1>

      <div className="space-y-6 text-sm">
        <section>
          <h2 className="font-semibold mb-2">How data is handled</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Images are processed in your browser and not uploaded by default</li>
            <li>Reports are encrypted in the browser before storage</li>
            <li>Decryption keys stay in the URL fragment and are never sent to the server</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold mb-2">What is stored</h2>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>Encrypted report blobs</li>
            <li>Signed assignment payloads needed to load assignments</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Operations and logs</h2>
          <p className="text-muted-foreground">
            Worker logs are used for operational debugging. Avoid submitting sensitive
            information that is not required for grading.
          </p>
        </section>
      </div>
    </div>
  );
}
