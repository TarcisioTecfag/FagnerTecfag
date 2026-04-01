import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, "..", "..", "data", "uploads");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const db = drizzle(pool, { schema });

async function sanitizeManuals() {
  console.log("🕵️ Iniciando varredura de manuais...");
  
  const docs = await db.select().from(schema.documents);
  console.log(`Encontrados ${docs.length} documentos no banco.`);

  let fixCount = 0;

  for (const doc of docs) {
    if (doc.filePath && doc.filePath.includes(" ")) {
      const oldPath = doc.filePath;
      const newPath = oldPath.replace(/\s+/g, '-');
      
      console.log(`\n⚠ Arquivo com espaço detectado: [${doc.id}] ${doc.name}`);
      console.log(`  De: ${oldPath}`);
      console.log(`  Para: ${newPath}`);

      // 1. Tentar renomear o arquivo no disco (se existir)
      const oldDiskPath = path.join(UPLOADS_DIR, oldPath.replace("/uploads/", ""));
      const newDiskPath = path.join(UPLOADS_DIR, newPath.replace("/uploads/", ""));

      let fileRenamed = false;
      if (fs.existsSync(oldDiskPath)) {
        try {
          fs.renameSync(oldDiskPath, newDiskPath);
          console.log(`  ✅ Renomeado FISICAMENTE com sucesso.`);
          fileRenamed = true;
        } catch (err: any) {
          console.error(`  ❌ Falha ao renomear arquivo físico: ${err.message}`);
        }
      } else {
        console.log(`  ⚠️ Arquivo físico não encontrado em: ${oldDiskPath}. (Apenas alterando DB)`);
        // Pode ser que o Railway descartou o arquivo se não houver persistência forte no "data/uploads",
        // mas o /fileData/ no PostgreSQL ainda salva a pátria se houver RAG manual real via Blob.
      }

      // 2. Renomear no banco de dados (sempre)
      try {
        await db.update(schema.documents)
          .set({ filePath: newPath })
          .where(eq(schema.documents.id, doc.id));
        console.log(`  ✅ Atualizado no BANCO DE DADOS.`);
        fixCount++;
      } catch (err: any) {
        console.error(`  ❌ Falha ao atualizar banco de dados: ${err.message}`);
      }
    }
  }

  console.log(`\n🚀 Saneamento finalizado. ${fixCount} manuais corrigidos.`);
  process.exit(0);
}

sanitizeManuals();
