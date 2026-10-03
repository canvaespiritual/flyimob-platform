import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { documentationStorage } = await import("../src/lib/documentacoes/storage.server");
  const { s3 } = await import("../src/lib/s3");
  const { GetPublicAccessBlockCommand, HeadBucketCommand, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  if (process.env.AWS_S3_DOCUMENTATION_BUCKET !== "flyimob-documentacoes2") throw new Error("Unexpected documentation bucket");
  try {
    await documentationStorage.ready();
    const head = await s3.send(new HeadBucketCommand({ Bucket: "flyimob-documentacoes2" }));
    const block = await s3.send(new GetPublicAccessBlockCommand({ Bucket: "flyimob-documentacoes2" }));
    console.log(JSON.stringify({ bucket: "flyimob-documentacoes2", region: head.BucketRegion, protection: block.PublicAccessBlockConfiguration, writes: 0 }));
    if (process.argv.includes("--empty")) {
      const listing = await s3.send(new ListObjectsV2Command({ Bucket: "flyimob-documentacoes2", MaxKeys: 1 }));
      const empty = !listing.Contents?.length && !listing.IsTruncated;
      console.log(JSON.stringify({ bucketEmpty: empty }));
      if (!empty) process.exitCode = 1;
    }
  } catch {
    // Diagnóstico limitado: não imprime credenciais, request IDs ou stack do SDK.
    try {
      await s3.send(new GetPublicAccessBlockCommand({ Bucket: "flyimob-documentacoes2" }));
      console.error(JSON.stringify({ protection: "rejected-by-application", writes: 0 }));
    } catch (error) {
      const sdkError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      console.error(JSON.stringify({ protection: "unverified", awsError: sdkError.name, httpStatus: sdkError.$metadata?.httpStatusCode, writes: 0 }));
      if (sdkError.name === "PermanentRedirect") {
        try {
          const result = await s3.send(new HeadBucketCommand({ Bucket: "flyimob-documentacoes2" }));
          console.error(JSON.stringify({ configuredRegion: process.env.AWS_REGION, bucketRegion: result.BucketRegion }));
        } catch (regionError) {
          const response = regionError as { $response?: { headers?: Record<string, string> } };
          console.error(JSON.stringify({ configuredRegion: process.env.AWS_REGION, bucketRegion: response.$response?.headers?.["x-amz-bucket-region"] ?? "unavailable" }));
        }
      }
    }
    process.exitCode = 1;
  } finally { s3.destroy(); }
}
void main().catch(() => { console.error("Falha de inicialização do diagnóstico; nenhum upload executado."); process.exitCode = 1; });
