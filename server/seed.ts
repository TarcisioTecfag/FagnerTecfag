/**
 * Seed script — cria o usuário inicial se não existir.
 * Execute com: npx tsx server/seed.ts
 */
import bcrypt from "bcryptjs";
import { storage } from "./storage.js";
import { bootstrapSchema } from "./db.js";

const SEED_USER = {
  name:     "Suporte 2",
  email:    "suporte2@tecfag.com.br",
  username: "suporte2",
  password: "123",
};

async function seed() {
  // Garante que o schema está criado
  await bootstrapSchema();

  const existing = await storage.getUserByEmail(SEED_USER.email);
  if (existing) {
    console.log(`✅ Usuário "${SEED_USER.email}" já existe.`);
    process.exit(0);
  }

  const hashed = bcrypt.hashSync(SEED_USER.password, 10);
  await storage.createUser({
    name: SEED_USER.name,
    email: SEED_USER.email,
    username: SEED_USER.username,
    password: hashed,
  });

  console.log(`✅ Usuário criado:`);
  console.log(`   Email: ${SEED_USER.email}`);
  console.log(`   Senha: ${SEED_USER.password}`);
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Erro no seed:", e);
  process.exit(1);
});
