// src/app/login/page.tsx
import LoginForm from "./LoginForm";

type LoginPageProps = {
  searchParams?: Promise<{ returnTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sp = (await searchParams) ?? {};
  const returnTo = sp.returnTo ?? "/admin";

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <LoginForm returnTo={returnTo} />
    </div>
  );
}
