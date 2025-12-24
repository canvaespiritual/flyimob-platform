// src/app/forgot-password/page.tsx
import ForgotPasswordForm from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <ForgotPasswordForm />
    </div>
  );
}
