import { ConfirmForm } from "./ConfirmForm";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="min-h-screen grid place-items-center p-6"><ConfirmForm token={token ?? ""} /></main>;
}
