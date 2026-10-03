"use client";
import { useState } from "react";
import DocumentsPanel from "@/app/admin/documentacoes/DocumentsPanel";
import WorkflowPanel from "@/app/admin/documentacoes/WorkflowPanel";
export default function FolderWorkflow({ id }: { id: string }) {
  const [revision, setRevision] = useState(0);
  return <div className="space-y-4"><WorkflowPanel folderId={id} onChange={() => setRevision(value => value + 1)} /><DocumentsPanel key={revision} folderId={id} /></div>;
}
