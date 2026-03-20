/**
 * Seed script — cria o usuário inicial se não existir.
 * Execute com: npx tsx server/seed.ts
 */
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import db from "./db.js";

const SEED_USER = {
  name:     "Suporte 2",
  email:    "suporte2@tecfag.com.br",
  username: "suporte2",
  password: "123",
};

function seed() {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(SEED_USER.email);
  if (existing) {
    console.log(`✅ Usuário "${SEED_USER.email}" já existe.`);
    return;
  }

  const hashed = bcrypt.hashSync(SEED_USER.password, 10);
  db.prepare(
    "INSERT INTO users (id, name, email, username, password) VALUES (?, ?, ?, ?, ?)"
  ).run(uuidv4(), SEED_USER.name, SEED_USER.email, SEED_USER.username, hashed);

  console.log(`✅ Usuário criado:`);
  console.log(`   Email: ${SEED_USER.email}`);
  console.log(`   Senha: ${SEED_USER.password}`);
}

seed();
