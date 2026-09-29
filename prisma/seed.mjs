import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const branch = await prisma.branch.upsert({ where: { slug: "venecia" }, update: { name: "Venecia" }, create: { name: "Venecia", slug: "venecia" } });
} finally { await prisma.$disconnect(); }
