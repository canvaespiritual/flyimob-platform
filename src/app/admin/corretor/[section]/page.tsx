import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/session.server";
import { authorizeOffice } from "@/lib/broker-office/policy";
import Office from "@/components/broker-office/Office";
export default async function BrokerOfficePage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getSessionUser(); if (!viewer) redirect("/login");
  try { authorizeOffice(viewer); } catch { redirect("/admin/forbidden"); }
  const { section } = await params;
  if (!["dashboard", "marketing", "financeiro"].includes(section)) notFound();
  const filters = await searchParams;
  const initialQuery = new URLSearchParams(Object.entries(filters).flatMap(([key, value]) => value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(v => [key, v] as [string, string]))).toString() || "period=month";
  return <Office section={section === "financeiro" ? "finance" : section as "dashboard" | "marketing"} initialQuery={initialQuery} />;
}
