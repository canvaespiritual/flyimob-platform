import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { PDFDocument, PDFName, PDFHexString } from "@cantoo/pdf-lib";
import { validateFile } from "../../src/lib/documentacoes/file-policy";

async function institutional() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  pdf.setTitle("Synthetic institutional statement");
  pdf.getForm().createTextField("reference").addToPage(page);
  return pdf;
}
async function accepted(bytes: Uint8Array) {
  const before = Buffer.from(bytes);
  assert.equal(await validateFile(bytes, "application/pdf", bytes.length), createHash("sha256").update(before).digest("hex"));
  assert.ok(Buffer.from(bytes).equals(before));
}

test("institutional PDF with metadata and AcroForm is accepted unchanged", async () => {
  await accepted(await (await institutional()).save());
});

test("AES permissions-protected institutional PDF is stored unchanged without inspection", async () => {
  const pdf = await institutional();
  pdf.encrypt({ userPassword: "", ownerPassword: "synthetic-owner", permissions: { printing: "highResolution", copying: true, modifying: false } });
  await accepted(await pdf.save());
});

test("PDF requiring an opening password is accepted without asking for the password", async () => {
  const pdf = await institutional();
  pdf.encrypt({ userPassword: "synthetic-opening-password", ownerPassword: "synthetic-owner" });
  const bytes = await pdf.save();
  await accepted(bytes);
});

test("signature fields and detached-signature dictionaries are accepted without rewriting", async () => {
  const pdf = await institutional();
  // Structural signature fixture: upload policy does not verify certificates.
  const signature = pdf.context.register(pdf.context.obj({ Type: "Sig", Filter: "Adobe.PPKLite", SubFilter: "adbe.pkcs7.detached", ByteRange: [0, 100, 200, 100], Contents: PDFHexString.of("30820000") }));
  const field = pdf.context.register(pdf.context.obj({ FT: "Sig", V: signature }));
  pdf.getForm().acroForm.addField(field);
  await accepted(await pdf.save({ updateFieldAppearances: false }));
});

test("legitimate incremental PDF revisions are accepted unchanged", async () => {
  const initial = await (await institutional()).save({ useObjectStreams: false });
  const pdf = await PDFDocument.load(initial, { forIncrementalUpdate: true });
  pdf.setSubject("Synthetic subsequent revision");
  const bytes = await pdf.save({ useObjectStreams: false });
  assert.ok((Buffer.from(bytes).toString("latin1").match(/%%EOF/g) ?? []).length >= 2);
  await accepted(bytes);
});

test("document bytes are not parsed or classified by their internal structure", async () => {
  for (const bytes of [Buffer.from("not a PDF"), Buffer.from("%PDF-1.7\ninvalid objects\n%%EOF")]) {
    await accepted(bytes);
  }
});

test("PDF actions and attachments are preserved without executing or inspecting them", async () => {
  for (const encrypted of [false, true]) {
    for (const attachment of [false, true]) {
      const pdf = await institutional();
      if (attachment) await pdf.attach(Buffer.from("synthetic attachment"), "payload.txt");
      else pdf.catalog.set(PDFName.of("OpenAction"), pdf.context.register(pdf.context.obj({ S: "JavaScript", JS: "app.alert('synthetic')" })));
      if (encrypted) pdf.encrypt({ userPassword: "", ownerPassword: "synthetic-owner" });
      const bytes = await pdf.save();
      await accepted(bytes);
    }
  }
});
