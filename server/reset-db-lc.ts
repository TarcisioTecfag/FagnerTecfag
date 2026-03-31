import { pool } from "./db.js";

async function run() {
  try {
    await pool.query('DELETE FROM lc_messages');
    await pool.query('DELETE FROM lc_pageviews');
    await pool.query('DELETE FROM lc_chats');
    await pool.query('DELETE FROM lc_visitors');
    console.log("Banco de dados LiveChat resetado com sucesso.");
  } catch (e) {
    console.error("Erro ao limpar:", e);
  } finally {
    await pool.end();
  }
}
run();
