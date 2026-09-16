import { requireUser } from "@/lib/authz.server";
import AcademyShell from "./AcademyShell";

export default async function AcademyLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <AcademyShell>{children}</AcademyShell>;
}
