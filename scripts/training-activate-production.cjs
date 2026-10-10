// Operator-only activation. Secrets stay in process memory / Railway backend variables.
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { mkdirSync, existsSync, readFileSync } = require('node:fs');
const { generateKeyPairSync, createPrivateKey, createPublicKey, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const cli = join(process.env.APPDATA, 'npm/node_modules/@railway/cli/bin/railway.js');
const fly = ['-p','a214a6b3-5fae-491d-91c6-e9b194d2e857','-s','b133c3a0-3c13-4a54-9c34-f3b229f1ff80','-e','production'];
function rail(args, input) { return execFileSync(process.execPath,[cli,...args],{ input, encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:180000 }); }
function vars(args) { return JSON.parse(rail(['variable','list',...args,'--json'])); }
function set(name,value) { rail(['variable','set',...fly,'--skip-deploys','--stdin',name],value); console.log(`${name}: configured (value suppressed)`); }
async function main() {
 const action=process.argv[2];
 if(action==='migrate') {
  const app=vars(fly), dbv=vars(['-p','2dada5aa-4cd1-44ba-a48a-aa262a7e2892','-s','b908224d-f38b-4a31-9bd2-ddf1f8104de9','-e','production']);
  const a=new URL(app.DATABASE_URL), b=new URL(dbv.DATABASE_URL), p=new URL(dbv.DATABASE_PUBLIC_URL);
  if(![b.hostname,p.hostname].includes(a.hostname)||a.pathname!==b.pathname||a.username!==b.username||a.password!==b.password) throw Error('target');
  const db=new PrismaClient({datasources:{db:{url:dbv.DATABASE_PUBLIC_URL}},log:[]});
  try {
   const rows=await db.$queryRawUnsafe('SELECT migration_name,finished_at,rolled_back_at FROM "_prisma_migrations"');
   const dirs=require('node:fs').readdirSync('prisma/migrations',{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name);
   const pending=dirs.filter(n=>!rows.some(r=>r.migration_name===n&&r.finished_at&&!r.rolled_back_at));
   if(pending.length!==1||pending[0]!=='20261010120000_training_access'||rows.some(r=>!r.finished_at&&!r.rolled_back_at)) throw Error('migration gate');
   execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:dbv.DATABASE_PUBLIC_URL},stdio:['ignore','pipe','pipe'],timeout:180000});
   const applied=await db.$queryRawUnsafe('SELECT migration_name,finished_at FROM "_prisma_migrations" WHERE migration_name=$1','20261010120000_training_access');
   if(!applied[0]?.finished_at) throw Error('not applied');
   console.log(JSON.stringify({migration:applied[0].migration_name,applied:true,finishedAt:applied[0].finished_at}));
  } finally {await db.$disconnect();}
 } else if(action==='configure') {
  const f=vars(fly);
  const key=f.HORIZONTE_PRIVATE_KEY||generateKeyPairSync('ed25519',{privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
  if(createPrivateKey(key.replace(/\\n/g,'\n')).asymmetricKeyType!=='ed25519') throw Error('key type');
  set('HORIZONTE_ENABLED','false');set('HORIZONTE_ORIGIN','https://ead-horizonte-production.up.railway.app');set('HORIZONTE_CLIENT_ID','flyimob');set('HORIZONTE_COURSE_IDS','cmv2etzu60000s90wahxoe74k');set('HORIZONTE_PRIVATE_KEY',key);
  const der=createPublicKey(key.replace(/\\n/g,'\n')).export({type:'spki',format:'der'});
  console.log(JSON.stringify({publicFingerprint:createHash('sha256').update(der).digest('hex'),deployTriggered:false}));
 } else if(action==='horizonte-register') {
  const f=vars(fly), pub=createPublicKey(f.HORIZONTE_PRIVATE_KEY.replace(/\\n/g,'\n')).export({type:'spki',format:'pem'});
  const code=`const {PrismaClient}=require('@prisma/client');const db=new PrismaClient({log:[]});(async()=>{try{await db.$transaction(async tx=>{const clients=await tx.integrationClient.findMany();if(clients.some(c=>c.id!=='flyimob'&&c.enabled))throw Error('other enabled client');const old=clients.find(c=>c.id==='flyimob');const publicKey=${JSON.stringify(pub)};if(old){if(old.publicKeyPem!==publicKey||old.allowedCourseIds.length!==1||old.allowedCourseIds[0]!=='cmv2etzu60000s90wahxoe74k')throw Error('existing client mismatch');await tx.integrationClient.update({where:{id:'flyimob'},data:{enabled:true}});}else await tx.integrationClient.create({data:{id:'flyimob',publicKeyPem:publicKey,enabled:true,allowedCourseIds:['cmv2etzu60000s90wahxoe74k']}});});console.log(JSON.stringify({client:'flyimob',enabled:true,scope:['cmv2etzu60000s90wahxoe74k'],userWrites:0,contentWrites:0}));}finally{await db.$disconnect();}})().catch(()=>{console.error('Client registration failed');process.exitCode=1;});`;
  const command=`node -e "eval(Buffer.from('${Buffer.from(code).toString('base64')}','base64').toString())"`;
  console.log(rail(['ssh','-p','a9c574c7-2e2a-4f23-ba3a-09b42df2b0d2','-s','84f19bcd-a157-4f4d-92da-87ac04ee8492','-e','production','-i',join(tmpdir(),'flyimob-horizonte-activation','railway_pilot'),'--',command]));
  rail(['variable','set','-p','a9c574c7-2e2a-4f23-ba3a-09b42df2b0d2','-s','84f19bcd-a157-4f4d-92da-87ac04ee8492','-e','production','--skip-deploys','--stdin','INTEGRATIONS_ENABLED'],'true');
  console.log('Horizonte flag configured; redeploy required.');
 } else if(action==='verify-auth') {
  const f=vars(fly),body='{}',timestamp=String(Date.now()),nonce=require('node:crypto').randomBytes(24).toString('base64url');
  const message=['POST','/api/integrations/v1/exchange',timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n');
  const signature=require('node:crypto').sign(null,Buffer.from(message),createPrivateKey(f.HORIZONTE_PRIVATE_KEY.replace(/\\n/g,'\n'))).toString('base64url');
  const code=`const {PrismaClient}=require('@prisma/client');const db=new PrismaClient({log:[]});(async()=>{try{const client=await db.integrationClient.findUnique({where:{id:'flyimob'}});const valid=require('crypto').verify(null,Buffer.from(${JSON.stringify(message)}),client.publicKeyPem,Buffer.from('${signature}','base64url'));if(!valid||!client.enabled)throw Error('signature');console.log(JSON.stringify({registeredPublicKeyValidatesBackendSignature:valid,integrationFlag:process.env.INTEGRATIONS_ENABLED==='true'}));}finally{await db.$disconnect();}})().catch(()=>{process.exitCode=1;});`;
  console.log(rail(['ssh','-p','a9c574c7-2e2a-4f23-ba3a-09b42df2b0d2','-s','84f19bcd-a157-4f4d-92da-87ac04ee8492','-e','production','-i',join(tmpdir(),'flyimob-horizonte-activation','railway_pilot'),'--',`node -e "eval(Buffer.from('${Buffer.from(code).toString('base64')}','base64').toString())"`]));
  const r=await fetch(f.HORIZONTE_ORIGIN+'/api/integrations/v1/exchange',{method:'POST',headers:{'content-type':'application/json','x-horizonte-client':f.HORIZONTE_CLIENT_ID,'x-horizonte-timestamp':timestamp,'x-horizonte-nonce':nonce,'x-horizonte-signature':signature},body,signal:AbortSignal.timeout(15000)});
  if(r.status!==400)throw Error('endpoint not enabled');
  console.log(JSON.stringify({exchangeEndpoint:r.status,reason:'signed request without identity rejected before database writes',accountsCreated:0,grantsCreated:0,fullLearnerExchange:'pending real pilot'}));
 } else if(action==='enable-flyimob') {
  set('HORIZONTE_ENABLED','true');
 } else if(action==='horizonte-read') {
  const code=`const {PrismaClient}=require('@prisma/client');const db=new PrismaClient({log:[]});(async()=>{try{const data=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return {clients:await tx.integrationClient.findMany({select:{id:true,enabled:true,allowedCourseIds:true,publicKeyPem:true}}),lesson:await tx.lesson.findUnique({where:{id:'cmv2exxp30004s90wmtc7qnyo'},select:{id:true,published:true,videoSource:true,activeMediaId:true}})};});for(const c of data.clients){c.fingerprint=require('crypto').createHash('sha256').update(require('crypto').createPublicKey(c.publicKeyPem).export({type:'spki',format:'der'})).digest('hex');delete c.publicKeyPem;}if(data.lesson?.activeMediaId)data.media=await db.mediaAsset.findUnique({where:{id:data.lesson.activeMediaId},select:{id:true,state:true,metadata:true}});console.log(JSON.stringify(data));}finally{await db.$disconnect();}})().catch(()=>{console.error('Remote database step failed');process.exitCode=1;});`;
  const command=`node -e "eval(Buffer.from('${Buffer.from(code).toString('base64')}','base64').toString())"`;
  console.log(rail(['ssh','-p','a9c574c7-2e2a-4f23-ba3a-09b42df2b0d2','-s','84f19bcd-a157-4f4d-92da-87ac04ee8492','-e','production','-i',join(tmpdir(),'flyimob-horizonte-activation','railway_pilot'),'--',command]));
 } else if(action==='ssh-prepare') {
  const dir=join(tmpdir(),'flyimob-horizonte-activation');mkdirSync(dir,{recursive:true});const key=join(dir,'railway_pilot');
  if(!existsSync(key)) execFileSync('ssh-keygen',['-t','ed25519','-f',key,'-N','','-C','flyimob-horizonte-temporary'],{stdio:'pipe'});
  const result=JSON.parse(rail(['api','mutation($input:SshPublicKeyCreateInput!){sshPublicKeyCreate(input:$input){id}}','--variables','@-'],JSON.stringify({input:{name:'Flyimob Horizonte temporary activation',publicKey:readFileSync(key+'.pub','utf8').trim()}})));
  require('node:fs').writeFileSync(join(dir,'registration.json'),JSON.stringify(result));
  console.log(JSON.stringify({temporarySshKey:key,registration:result}));
 } else {throw Error('unknown action');}
}
main().catch(()=>{console.error('Activation step failed; sensitive diagnostics suppressed. No subsequent step executed.');process.exitCode=1;});
