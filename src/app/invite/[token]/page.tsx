import AcceptInviteForm from "./AcceptInviteForm";

export const dynamic = "force-dynamic";

export default function InviteTokenPage({ params }: { params: { token: string } }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-lg p-6">
        <h1 className="text-lg font-semibold">Aceitar convite</h1>
        <p className="text-sm text-gray-600 mt-2">
          Defina uma senha para ativar seu acesso.
        </p>
        <div className="mt-4">
          <AcceptInviteForm token={params.token} />
        </div>
      </div>
    </div>
  );
}
