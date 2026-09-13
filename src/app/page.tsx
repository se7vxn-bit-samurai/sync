import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Sync</h1>
      <p className="text-sm text-gray-500">Signed in as {user.email}</p>
      <form action="/logout" method="post">
        <button className="rounded border px-3 py-2 text-sm" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
