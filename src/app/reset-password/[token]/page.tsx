// src/app/reset-password/[token]/page.tsx
import { notFound } from "next/navigation";
import ResetPasswordForm from "./ResetPasswordForm";

type PageProps = {
  params: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ params }: PageProps) {
  const { token } = await params;

  if (!token) return notFound();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <ResetPasswordForm token={token} />
    </div>
  );
}
