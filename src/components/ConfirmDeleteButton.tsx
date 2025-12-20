"use client";

import React from "react";

export default function ConfirmDeleteButton({
  formAction,
  confirmText = "Tem certeza que deseja excluir? Essa ação não pode ser desfeita.",
  className = "border rounded px-4 py-2 hover:bg-gray-50",
  children = "Excluir",
}: {
  formAction: string;
  confirmText?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      formAction={formAction}
      formMethod="post"
      className={className}
      onClick={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
