"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Link2, Loader2 } from "lucide-react";
import { importJobAction } from "@/app/dashboard/actions";
import { Button, Input } from "@/components/ui";

export function JobUrlImporter() {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Awaited<ReturnType<typeof importJobAction>> | null>(null);

  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setRes(null);
          start(async () => {
            const r = await importJobAction(url);
            setRes(r);
            if (r.ok) setUrl("");
          });
        }}
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a job URL — we'll scrape, classify, score and add it" className="pl-9" type="url" required disabled={pending} />
        </div>
        <Button disabled={pending || !url}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Importing…
            </>
          ) : (
            "Import job"
          )}
        </Button>
      </form>
      {res && (
        <p className={`mt-2 px-1 text-sm ${res.ok ? "text-accent" : "text-warn"}`}>
          {res.ok ? (
            <>
              Added <strong>{res.title}</strong> at {res.company} — fit {res.score}/100.{" "}
              <Link href={`/dashboard/pipeline/${res.pipelineId}`} className="underline underline-offset-2">
                Open
              </Link>
            </>
          ) : (
            res.error
          )}
        </p>
      )}
    </div>
  );
}
