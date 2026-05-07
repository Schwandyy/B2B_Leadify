import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const slug = "demo-org";
  const email = "demo@product2lead.local";

  // Idempotent: re-run safely
  await prisma.organization.upsert({
    where: { slug },
    create: {
      name: "Demo Workspace",
      slug,
      subscription: { create: { tier: "pro", monthlyLeadLimit: 1000, monthlyAnalysisLimit: 200 } },
    },
    update: {},
  });

  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error("seed: org missing after upsert");

  const passwordHash = await bcrypt.hash("demo1234", 12);
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name: "Demo Admin",
      role: "ADMIN",
      organizationId: org.id,
    },
    update: { passwordHash },
  });

  const owner = await prisma.user.findUnique({ where: { email } });
  if (!owner) throw new Error("seed: owner missing");

  const productName = "Arduino Starter Kit für Schulen";
  let product = await prisma.product.findFirst({
    where: { organizationId: org.id, name: productName },
  });
  if (!product) {
    product = await prisma.product.create({
      data: {
        organizationId: org.id,
        ownerId: owner.id,
        name: productName,
        description:
          "Einsatzfertiges Elektronik-Lernset auf Arduino-Basis mit Sensoren, Komponenten und didaktisch aufbereiteten Lernpfaden für MINT-Unterricht ab Klasse 8 und Berufsausbildung.",
        productUrl: "https://example.com/arduino-school-kit",
        category: "Bildungselektronik",
        targetRegion: "DACH",
        targetCustomerTypes: ["EDUCATION", "DISTRIBUTOR", "PUBLIC_SECTOR", "PARTNER"],
        keywords: ["Arduino", "MINT", "Elektronik-Lernset", "Berufsschule", "Workshop"],
        exclusions: ["Endkundengeschäft", "Privatkunden"],
        priceRangeMin: 89,
        priceRangeMax: 249,
      },
    });
  }

  console.log(`Seed complete. Login: ${email} / demo1234`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
