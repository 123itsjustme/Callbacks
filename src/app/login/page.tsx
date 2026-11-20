import Link from "next/link";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/dashboard";
  const mode = sp.mode === "signup" ? "signup" : "signin";
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center font-serif text-3xl">
          Folio
        </Link>
        <Card className="p-6">
          {error && <p className="mb-4 text-sm text-warn">{error}</p>}
          <LoginForm next={next} initialMode={mode} />
        </Card>
      </div>
    </main>
  );
}
