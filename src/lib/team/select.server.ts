import type { Prisma } from "@prisma/client";

/** Safe administrative projection: excludes hashes, reset tokens and financial values. */
export const personSelect = { id: true, name: true, email: true, operationalRole: true, active: true, independent: true, mergedIntoId: true,
  user: { select: { id: true, email: true, role: true, isActive: true } },
  financialParticipant: { select: { id: true, name: true, active: true } } } satisfies Prisma.OperationPersonSelect;
