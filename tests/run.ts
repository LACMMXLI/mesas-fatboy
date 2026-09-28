import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const database = join(root, "prisma", "test.db");
async function main() {
  process.env.DATABASE_URL = "file:./test.db";
  process.env.RUST_LOG = "trace";
  await rm(database, { force: true });
  await rm(`${database}-journal`, { force: true });
  const setup = spawnSync(process.execPath, [join(root, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--schema", "prisma/schema.prisma"], { cwd: root, env: process.env, stdio: "inherit" });
  if (setup.status !== 0) throw new Error("No se pudo preparar la base de prueba.");
  const seed = spawnSync(process.execPath, [join(root, "prisma", "seed.mjs")], { cwd: root, env: process.env, stdio: "inherit" });
  if (seed.status !== 0) throw new Error("No se pudo ejecutar el seed.");
  try {
    const tests = spawnSync(process.execPath, [join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--test", "tests/workflow.test.ts"], { cwd: root, env: process.env, stdio: "inherit" });
    if (tests.status !== 0) process.exitCode = tests.status ?? 1;
  } finally {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
    await rm(database, { force: true });
    await rm(`${database}-journal`, { force: true });
    await rm(`${database}-wal`, { force: true });
    await rm(`${database}-shm`, { force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
