async function testTask() {
  const token = "pu4wmVV51KE1kXjDXa09zbTZLcPVqoLQ";
  
  const payload = {
    data: {
      name: "⚡ Ligar para o cliente agora",
      type: "call",
      deal_id: "68dbfb62ccf76000142d9e8a",
      owner_ids: ["678fce184463410018ed0a69"],
      due_date: new Date().toISOString()
    }
  };
  
  const res = await fetch("https://api.rd.services/crm/v2/tasks", {
    method: "POST",
    headers: {
      "Authorization": `Bearer pu4wmVV51KE1kXjDXa09zbTZLcPVqoLQ`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}
testTask();
