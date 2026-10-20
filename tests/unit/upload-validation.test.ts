import { test } from "node:test";
import assert from "node:assert/strict";
import * as uploads from "../../src/lib/uploads";

test("PDF validation rejects a forged MIME type and truncated documents", () => {
  assert.equal(uploads.isPdfDocument(Buffer.from("<html><script>alert(1)</script></html>")), false);
  assert.equal(uploads.isPdfDocument(Buffer.from("%PDF-1.7\ntruncated")), false);
  assert.equal(uploads.isPdfDocument(Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n")), true);
});

test("multipart upload size is bounded even without a Content-Length header", async () => {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(2048)]), "large.pdf");
  const encoded = new Request("http://localhost/upload", { method: "POST", body: form });
  const request = new Request("http://localhost/upload", {
    method: "POST", headers: encoded.headers, body: await encoded.arrayBuffer(),
  });
  assert.equal(request.headers.get("content-length"), null);
  await assert.rejects(uploads.readBapForm(request, 1024), /BAP_BODY_TOO_LARGE/);
});

test("bounded multipart parser preserves valid files and fields", async () => {
  const form = new FormData();
  form.set("file", new Blob(["document"]), "small.pdf");
  form.set("quantity", "3");
  const parsed = await uploads.readBapForm(new Request("http://localhost/upload", { method: "POST", body: form }), 1024);
  assert.equal(parsed.get("quantity"), "3");
  assert.equal(await (parsed.get("file") as File).text(), "document");
});
