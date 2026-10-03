import assert from "node:assert/strict";
import { test } from "node:test";
import { DOCUMENT_FORMATS, DOCUMENT_FILE_ACCEPT, MAX_DOCUMENT_BYTES, documentationMimeType, supportsDocumentationPreview } from "../../src/lib/documentacoes/file-formats";
import { fileMetadata, validateFile } from "../../src/lib/documentacoes/file-policy";

for (const format of DOCUMENT_FORMATS) for (const extension of format.extensions) {
  test(`${extension} is allowed consistently by browser and server`, () => {
    const name = `photo.${extension.toUpperCase()}`;
    assert.ok(DOCUMENT_FILE_ACCEPT.split(",").includes(`.${extension}`));
    for (const declared of [format.mime, "", "application/octet-stream", ...format.aliases]) {
      assert.equal(documentationMimeType(name, declared), format.mime);
      assert.equal(fileMetadata({ originalFileName: name, mimeType: declared, fileSize: 10 }).mimeType, format.mime);
    }
  });
}
for (const extension of ["mp4", "mov", "avi", "mkv", "webm", "exe", "msi", "bat", "cmd", "js", "html", "svg"]) {
  test(`${extension} is rejected even with a forged documentary MIME`, () => {
    assert.equal(documentationMimeType(`file.${extension}`, "application/pdf"), undefined);
    assert.throws(() => fileMetadata({ originalFileName: `file.${extension}`, mimeType: "application/pdf", fileSize: 10 }));
  });
}
test("video or executable MIME cannot be submitted as a documentary extension", () => {
  for (const mime of ["video/mp4", "video/quicktime", "application/x-msdownload", "text/html"]) assert.equal(documentationMimeType("file.pdf", mime), undefined);
});
test("empty files and oversized uploads are rejected; the 15 MB limit remains", async () => {
  for (const size of [0, MAX_DOCUMENT_BYTES + 1]) assert.throws(() => fileMetadata({ originalFileName: "file.pdf", mimeType: "application/pdf", fileSize: size }));
  assert.equal(fileMetadata({ originalFileName: "file.pdf", mimeType: "application/pdf", fileSize: MAX_DOCUMENT_BYTES }).fileSize, MAX_DOCUMENT_BYTES);
  await assert.rejects(validateFile(new Uint8Array(), "application/pdf", 0));
  await assert.rejects(validateFile(new Uint8Array(MAX_DOCUMENT_BYTES + 1), "application/pdf", MAX_DOCUMENT_BYTES + 1));
  await assert.rejects(validateFile(new Uint8Array(1), "application/pdf", 2));
});
test("storage eligibility and preview compatibility are independent", () => {
  for (const mime of ["image/heic", "image/heif", "image/tiff"]) {
    assert.ok(DOCUMENT_FORMATS.some(format => format.mime === mime));
    assert.equal(supportsDocumentationPreview(mime), false);
  }
  for (const mime of ["application/pdf", "image/jpeg", "image/png", "image/webp"]) assert.equal(supportsDocumentationPreview(mime), true);
});
