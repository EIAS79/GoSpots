import { PrismaClient, SystemRole } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@gospots.local";
  const adminPassword = "ChangeMe123!"; // change after first login

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await argon2.hash(adminPassword, {
          type: argon2.argon2id,
          memoryCost: 19 * 1024,
          timeCost: 2,
          parallelism: 1,
        }),
        name: "Platform Admin",
        systemRole: SystemRole.SUPER_ADMIN,
        emailVerified: true,
      },
    });
    console.log(`✓ Created SUPER_ADMIN: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log("✓ Super admin already exists");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
