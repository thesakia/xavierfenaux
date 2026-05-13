import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

type DashboardCredential = {
  username: string;
  password: string;
};

function parseDashboardUsers(): DashboardCredential[] {
  const rawUsers = process.env.DASHBOARD_USERS;

  if (rawUsers) {
    return rawUsers
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => entry.includes(":"))
      .map((entry) => {
        const separatorIndex = entry.indexOf(":");
        return {
          username: entry.slice(0, separatorIndex).trim(),
          password: entry.slice(separatorIndex + 1).trim(),
        };
      })
      .filter((credential) => credential.username && credential.password);
  }

  if (process.env.DASHBOARD_USERNAME && process.env.DASHBOARD_PASSWORD) {
    return [
      {
        username: process.env.DASHBOARD_USERNAME,
        password: process.env.DASHBOARD_PASSWORD,
      },
    ];
  }

  return [];
}

export async function verifyDashboardLogin(username: string, password: string) {
  const credentials = parseDashboardUsers();
  const credential = credentials.find((item) => item.username === username);

  if (credentials.length === 0) {
    throw new Error("DASHBOARD_USERS or DASHBOARD_USERNAME/DASHBOARD_PASSWORD must be configured.");
  }

  if (!credential || password !== credential.password) {
    return null;
  }

  const existing = await prisma.user.findUnique({ where: { username } });

  if (!existing) {
    return prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(credential.password, 12),
      },
    });
  }

  const isValid = await bcrypt.compare(password, existing.passwordHash);
  if (isValid) return existing;

  return prisma.user.update({
    where: { id: existing.id },
    data: { passwordHash: await bcrypt.hash(credential.password, 12) },
  });
}
