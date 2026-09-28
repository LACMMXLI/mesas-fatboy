import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const branch = await prisma.branch.upsert({ where: { slug: "venecia" }, update: { name: "Venecia" }, create: { name: "Venecia", slug: "venecia" } });
  for (let number = 1; number <= 15; number++) await prisma.restaurantTable.upsert({ where: { branchId_number: { branchId: branch.id, number } }, update: {}, create: { branchId: branch.id, number } });
  for (const name of ["Carlos", "Daniel", "Valentina", "Luis", "Mariana", "Jorge", "Sofía", "Miguel"]) {
    if (!await prisma.employee.findFirst({ where: { branchId: branch.id, name } })) await prisma.employee.create({ data: { name, branchId: branch.id } });
  }
} finally { await prisma.$disconnect(); }
