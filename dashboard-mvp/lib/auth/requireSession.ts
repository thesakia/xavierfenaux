import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export async function requireDashboardSession() {
  const session = await getSession();
  if (!session) {
    redirect("/dashboard/login");
  }
  return session;
}
