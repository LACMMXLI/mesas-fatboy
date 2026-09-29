import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const existing = await prisma.branch.findFirst({ where: { OR: [{ slug: "roma" }, { slug: "venecia" }] } });
  if (existing) await prisma.branch.update({ where: { id: existing.id }, data: { name: "Roma", slug: "roma" } });
  else await prisma.branch.create({ data: { name: "Roma", slug: "roma" } });
} finally { await prisma.$disconnect(); }
