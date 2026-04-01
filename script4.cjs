const fs = require('fs');
let txt = fs.readFileSync('client/src/pages/LiveChat.tsx', 'utf8');

const rawTxt = txt.replace(/\r/g, '');

const s2 = `  // Fetch chat history when visitor selected in CRM
  useEffect(() => {
    if (!selectedVisitor) { setVisitorChats([]); return; }
    fetch(\`/api/livechat/visitors/\${selectedVisitor.id}/chats\`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setVisitorChats)
      .catch(() => setVisitorChats([]));
  }, [selectedVisitor]);`;

const r2 = `  // Fetch chat history when visitor selected in CRM
  useEffect(() => {
    if (!selectedVisitor) { 
      setVisitorChats([]); 
      setPastNegotiations([]);
      return; 
    }
    fetch(\`/api/livechat/visitors/\${selectedVisitor.id}/chats\`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setVisitorChats)
      .catch(() => setVisitorChats([]));

    fetch(\`/api/livechat/visitors/\${selectedVisitor.id}/history\`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setPastNegotiations)
      .catch(() => setPastNegotiations([]));
  }, [selectedVisitor]);`;

if (txt.includes(s2)) {
  txt = txt.replace(s2, r2);
  fs.writeFileSync('client/src/pages/LiveChat.tsx', txt, 'utf8');
  console.log('SUCCESS');
} else if (rawTxt.includes(s2.replace(/\r/g, ''))) {
  txt = rawTxt.replace(s2.replace(/\r/g, ''), r2.replace(/\r/g, ''));
  fs.writeFileSync('client/src/pages/LiveChat.tsx', txt, 'utf8');
  console.log('SUCCESS RAW');
} else {
  console.log('NOT FOUND USE-EFFECT');
}
