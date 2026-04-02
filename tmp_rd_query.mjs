import { readFileSync } from 'fs';
const env = readFileSync('.env', 'utf-8');
const accessToken = env.match(/RD_CRM_ACCESS_TOKEN=(.+)/)?.[1]?.trim();

async function rdGet(path, at) {
  const r = await fetch(`https://api.rd.services/crm/v2${path}`, { 
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }
  });
  const body = await r.json();
  return { status: r.status, body };
}

// Testa token atual e lista funis
console.log('Testando com access_token atual...');
const pipelines = await rdGet('/pipelines', accessToken);
console.log('Status:', pipelines.status);
if (pipelines.status !== 200) {
  console.log('Erro:', JSON.stringify(pipelines.body));
  process.exit(1);
}

console.log('\n=== FUNIS DE VENDA ===');
const pData = pipelines.body?.data || [];
for (const p of pData) {
  console.log(`\nFUNIL: "${p.name}"\n  ID: ${p.id}\n  stage_ids: ${JSON.stringify(p.stage_ids)}`);
}
