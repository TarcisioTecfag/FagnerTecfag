/**
 * Teste direto da API Gemini — simula exatamente o que o livechatAI.ts faz
 * Executa: npx tsx test-gemini-direct.ts
 */

const GEMINI_CHAT_MODEL = "gemini-3.1-pro-preview";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

async function main() {
  // Lê a API key do .env ou variável de ambiente
  const { config } = await import("dotenv");
  config();
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY não encontrada no .env");
    process.exit(1);
  }
  console.log(`✅ API Key encontrada (${apiKey.slice(0, 8)}...)`);

  // Cenário 1: Histórico vazio, só "boa tarde"
  console.log("\n=== TESTE 1: Sem histórico, só 'boa tarde' ===");
  await testCall(apiKey, [
    { role: "user", parts: [{ text: "boa tarde" }] }
  ]);

  // Cenário 2: Mensagem proativa do Fagner antes
  console.log("\n=== TESTE 2: Model primeiro (proativo), depois user ===");
  await testCall(apiKey, [
    { role: "model", parts: [{ text: "Olá! Posso te ajudar?" }] },
    { role: "user", parts: [{ text: "boa tarde" }] }
  ]);

  // Cenário 3: Com user fantasma (normalizado) 
  console.log("\n=== TESTE 3: User fantasma + model + user ===");
  await testCall(apiKey, [
    { role: "user", parts: [{ text: "(Cliente acessou o Widget e o atendente tomou a iniciativa de abordagem)" }] },
    { role: "model", parts: [{ text: "Olá! Posso te ajudar?" }] },
    { role: "user", parts: [{ text: "boa tarde" }] }
  ]);

  // Cenário 4: Simula exatamente 3 mensagens de saudação seguidas do banco
  console.log("\n=== TESTE 4: 3 model messages merged + user ===");
  await testCall(apiKey, [
    { role: "user", parts: [{ text: "(Cliente acessou o Widget e o atendente tomou a iniciativa de abordagem)" }] },
    { role: "model", parts: [{ text: "Olá, Henrique 👋\n\nSou o Fagner, Especialista em automações industriais!\n\nComo posso te ajudar hoje? 😊" }] },
    { role: "user", parts: [{ text: "boa tarde" }] }
  ]);
}

async function testCall(apiKey: string, contents: any[]) {
  const systemPrompt = "Você é Fagner, representante comercial da Tecfag. Responda de forma amigável e profissional.";
  
  const url = `${GEMINI_BASE}/models/${GEMINI_CHAT_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.75, maxOutputTokens: 200 },
  };

  console.log(`  Roles: ${contents.map((c: any) => c.role).join(' -> ')}`);
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`  ❌ HTTP ${res.status}: ${body.slice(0, 500)}`);
      return;
    }

    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (reply) {
      console.log(`  ✅ Resposta: "${reply.slice(0, 150)}"`);
    } else {
      console.error(`  ⚠️ Sem texto na resposta:`, JSON.stringify(data).slice(0, 500));
    }
  } catch (err: any) {
    console.error(`  ❌ Erro: ${err.message}`);
  }
}

main().catch(console.error);
