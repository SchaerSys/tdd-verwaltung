import { redirect } from "next/navigation";
import { getCurrentUser, landingFor } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? landingFor(user.role) : "/login");
}
