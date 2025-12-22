// src/app/login/page.tsx
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic"; // evita prerender do /login

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { returnTo?: string };
}) {
  const returnTo = searchParams?.returnTo ?? "/admin/construtoras";

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <LoginForm returnTo={returnTo} />
    </div>
  );
}
