import { requireUser } from "@/lib/authz.server";
import { notFound } from "next/navigation";
import Training from "@/components/training/Training";
export default async function Page() { const s = await requireUser(); if (s.user.role !== "BROKER" || s.tenant.isPlatform) notFound(); return <Training />; }
