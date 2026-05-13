import { prisma } from "@/lib/db/prisma";

export async function auditLog(action: string, message: string, metadata?: unknown) {
  await prisma.auditLog.create({
    data: {
      action,
      message,
      metadata: metadata === undefined ? undefined : (metadata as object),
    },
  });
}
