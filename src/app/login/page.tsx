// src/app/login/page.tsx
import LoginForm from "./LoginForm";
import Link from "next/link";

type LoginPageProps = {
  searchParams?: Promise<{ returnTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sp = (await searchParams) ?? {};
  const returnTo = sp.returnTo ?? "/admin";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-3">
      <LoginForm returnTo={returnTo} />

      <Link
        href="/forgot-password"
        className="text-sm underline text-gray-600 hover:text-gray-800"
      >
        Esqueci minha senha
      </Link>
    </div>
  );
}
