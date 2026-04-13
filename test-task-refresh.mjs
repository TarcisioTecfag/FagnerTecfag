async function run() {
  const tokenUrl = "https://api.rd.services/auth/token";
  const body = {
    client_id: "ee9739d3-be23-4005-a1cd-d88842a38de9",
    client_secret: "2490b311239e41bbb3337eb85019d419",
    refresh_token: "y5UhNMPDre7cFXknTrWGOuQv4rji5j0V",
    grant_type: "refresh_token"
  };

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await tokenRes.json();
  const token = data.access_token;
  
  if (!token) {
    console.error("Falha ao obter token:", data);
    return;
  }

  const payloadV2 = {
    data: {
      name: "⚡ Ligar para o cliente agora",
      type: "call",
      deal_id: "678e71bd97db67000e4cd8b8",
      owner_ids: ["678fce184463410018ed0a69"],
      due_date: new Date().toISOString()
    }
  };

  console.log("Testando V2 format...");
  const res = await fetch("https://api.rd.services/crm/v2/tasks", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payloadV2)
  });

  const text = await res.text();
  console.log("Status HTTP:", res.status);
  console.log("Response:", text);
}

run();
