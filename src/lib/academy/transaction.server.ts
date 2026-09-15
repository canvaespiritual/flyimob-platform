import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AcademyError } from "./limits";

export async function academyTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10_000,
      });
    } catch (error) {
      // Concurrent duplicate inserts may surface as unique conflicts, not only P2034.
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        if (attempt < 2) continue;
        throw new AcademyError(409, "concurrent_request_retry");
      }
      throw error;
    }
  }
  throw new AcademyError(409, "concurrent_request_retry");
}
