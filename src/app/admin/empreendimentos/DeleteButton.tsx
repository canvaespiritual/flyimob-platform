"use client";

export default function DeleteButton({ label = "Excluir" }: { label?: string }) {
  return (
    <button
      type="submit"
      className="border rounded px-3 py-2 text-red-600 hover:bg-red-50"
      onClick={(e) => {
        const ok = confirm(
          "Tem certeza que deseja excluir?\n\nTodo o cadastro, imagens, anexos e tipologias serão excluídos."
        );
        if (!ok) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
