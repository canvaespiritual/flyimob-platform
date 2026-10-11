import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { learnerRequest } from "../../src/lib/training/horizonte.server";
import { trainingFetch, TrainingClientError, resumePosition } from "../../src/lib/training/client";

test("BFF preserves upstream session, progress, media and authorization errors without leaking payloads", async () => {
  const names = ["HORIZONTE_ENABLED", "HORIZONTE_ORIGIN", "HORIZONTE_CLIENT_ID", "HORIZONTE_PRIVATE_KEY"];
  const saved = names.map(n => process.env[n]), oldFetch = globalThis.fetch;
  const {privateKey} = generateKeyPairSync("ed25519");
  Object.assign(process.env,{HORIZONTE_ENABLED:"true",HORIZONTE_ORIGIN:"https://synthetic.invalid",HORIZONTE_CLIENT_ID:"synthetic",HORIZONTE_PRIVATE_KEY:privateKey.export({format:"pem",type:"pkcs8"}).toString()});
  try {
    for (const [path, status, upstream, code, expected] of [
      ["playback",400,"Há cinco reproduções abertas. Aguarde sua expiração ou feche as sessões anteriores.","session_limit",400],
      ["progress",400,"SESSION_EXPIRED","session_expired",400],
      ["progress",400,"arbitrary secret text","progress_rejected",400],
      ["progress",429,"TOO_FREQUENT","too_frequent",429],
      ["playback",400,"O vídeo ainda não está pronto para reprodução.","media_not_ready",400],
      ["playback",401,"Entre novamente.","upstream_authorization",502],
    ] as const) {
      globalThis.fetch = async () => Response.json({error:upstream},{status});
      await assert.rejects(learnerRequest("synthetic",`/api/lessons/synthetic/${path}`,"POST"),(e: unknown) => {assert.equal((e as {code:string}).code,code);assert.equal((e as {status:number}).status,expected);assert.equal((e as Error).message.includes("secret"),false);return true;});
    }
  } finally {globalThis.fetch=oldFetch;names.forEach((name,i)=>{if(saved[i]===undefined)delete process.env[name];else process.env[name]=saved[i];});}
});
test("recoverable progress errors keep playback authorized; revocation remains fatal",async()=>{
  const oldFetch=globalThis.fetch;
  try {
    for(const [code,status,denied] of [["invalid_progress",400,false],["progress_rejected",400,false],["too_frequent",429,false],["session_expired",400,false],["session_limit",400,false],["access_revoked",403,true],["login_required",401,true],["upstream_authorization",502,true]] as const){
      globalThis.fetch=async()=>Response.json({error:code},{status});
      await assert.rejects(trainingFetch("/synthetic"),(e:unknown)=>{assert.ok(e instanceof TrainingClientError);assert.equal(e.accessDenied,denied);assert.equal(e.message.includes("Verifique sua conexão"),false);return true;});
    }
  } finally {globalThis.fetch=oldFetch;}
});
test("resume clamps valid saved positions and rejects corrupt metadata without modifying stored progress",()=>{
  assert.equal(resumePosition(240,2707),240);assert.equal(resumePosition(3000,2707),2707);
  for(const position of [NaN,Infinity,-1,null,"240"])assert.equal(resumePosition(position,2707),0);
  assert.equal(resumePosition(240,NaN),0);
});
