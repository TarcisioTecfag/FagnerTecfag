import { config } from "dotenv";
config();
import { getRdValidToken } from "./server/livechat/rdCrmService.js";

async function run() {
  const token = await getRdValidToken();
  const dealId = "678e71bd97db67000e4cd8b8";
  const ownerId = "678fce184463410018ed0a69";
  
  const payload = {
    task: { // Let's try wrapping it in task: {}
      name: "⚡ Ligar para o cliente agora",
      type: "call",
      deal_id: dealId,
      owner_ids: [ownerId],
      due_date: new Date().toISOString(),
      description: "Teste"
    }
  };

  const res = await fetch("https://api.rd.services/crm/v2/tasks", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log("Status HTTP task wrap:", res.status);
  console.log("Response:", text);

  const payloadData = {
    data: { // Let's try wrapping it in data: {}
      name: "⚡ Ligar para o cliente agora",
      type: "call",
      deal_id: dealId,
      owner_ids: [ownerId],
      due_date: new Date().toISOString(),
      description: "Teste"
    }
  };

  const res2 = await fetch("https://api.rd.services/crm/v2/tasks", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payloadData)
  });

  const text2 = await res2.text();
  console.log("Status HTTP data wrap:", res2.status);
  console.log("Response:", text2);
}

run();
