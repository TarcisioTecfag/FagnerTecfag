async function main() {
  const r = await fetch('https://fagnertecfag-production.up.railway.app/api/livechat/rd-pipelines');
  const d = await r.json();
  const pipelines = d.data.data;
  
  const target = pipelines.find(p => p.name.toLowerCase().includes('venda'));
  console.log('--- FOUND ---');
  console.log('Name:', target.name);
  console.log('Pipeline ID:', target.id);
  
  const sr = await fetch(`https://fagnertecfag-production.up.railway.app/api/livechat/rd-stages/${target.id}`);
  const sd = await sr.json();
  
  console.log('\n--- STAGES ---');
  sd.data.data.forEach(s => {
      console.log(`- ${s.name} (ID: ${s.id})`);
  });
}
main();
