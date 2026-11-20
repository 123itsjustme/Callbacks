import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-serif text-6xl">404</p>
      <p className="mt-3 text-muted">This page doesn&apos;t exist — or this portfolio is private.</p>
      <Link href="/" className="mt-6 text-sm underline underline-offset-2">
        Go home
      </Link>
    </main>
  );
}
