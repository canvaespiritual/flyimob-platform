// Offline key/configuration inspection. Never generates keys or calls Horizonte.
import { createPrivateKey, createPublicKey, createHash, sign, verify } from 'node:crypto';
import { loadDocumentationEnv } from './documentacoes-env.mjs';
loadDocumentationEnv();
const raw = process.env.HORIZONTE_PRIVATE_KEY;
if (!raw) { console.log(JSON.stringify({ signingConfigured: false, action: 'provide_backend_key_after_authorization', remoteCalls: 0 })); process.exit(0); }
try {
  const privateKey = createPrivateKey(raw.replace(/\\n/g, '\n'));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('wrong_key_type');
  const publicKey = createPublicKey(privateKey);
  const fingerprint = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  const bytes = Buffer.from('Flyimob offline signing validation');
  console.log(JSON.stringify({ signingConfigured: true, algorithm: 'Ed25519', publicKeySha256: fingerprint, signatureVerified: verify(null, bytes, publicKey, sign(null, bytes, privateKey)), remoteCalls: 0 }));
} catch { console.error('Invalid backend signing configuration; key material suppressed.'); process.exitCode = 1; }
