import { ResetForm } from "./ResetForm";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="min-h-screen grid place-items-center p-6"><ResetForm token={token ?? ""} /></main>;
}
