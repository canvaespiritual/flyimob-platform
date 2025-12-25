// src/app/invite/[token]/page.tsx
import InviteAcceptForm from "./InviteAcceptForm";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: Props) {
  const { token } = await params;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6">
        <h1 className="text-xl font-semibold">Ativar acesso</h1>
        <p className="text-sm text-gray-600 mt-2">
          Defina sua senha para entrar no FlyImob.
        </p>

        <div className="mt-6">
          <InviteAcceptForm token={token} />
        </div>
      </div>
    </div>
  );
}
