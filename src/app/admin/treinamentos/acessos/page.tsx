import { requireUser } from "@/lib/authz.server";
import { notFound } from "next/navigation";
import AccessManager from "@/components/training/AccessManager";
export default async function Page() { const s = await requireUser(); if (s.tenant.isPlatform || !["OWNER", "DIRECTOR"].includes(s.user.role)) notFound(); return <AccessManager />; }
