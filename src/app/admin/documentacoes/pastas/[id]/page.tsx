import { FolderDetailView } from "../../ui";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <FolderDetailView id={id} />; }
