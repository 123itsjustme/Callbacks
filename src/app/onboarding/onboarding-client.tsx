"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { uploadCvAction, saveBasicsAction, type OnboardResult } from "./actions";
import { Button, Card, Input, Label, Textarea, buttonClass } from "@/components/ui";
import { AVAILABILITY_OPTIONS, cn } from "@/lib/utils";

const STEPS = ["Reading your CV…", "Structuring your experience…", "Building portfolio case studies…", "Matching you to open roles…"];

export function OnboardingClient({ appUrl, hasProfile }: { appUrl: string; hasProfile: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [saveState, setSaveState] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [savePending, startSave] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.(pdf|docx|txt|md)$/i.test(f.name)) return setResult({ ok: false, error: "Please upload a PDF or DOCX." });
    if (f.size > 4 * 1024 * 1024) return setResult({ ok: false, error: "That file is over 4MB." });
    setResult(null);
    setFile(f);
  };

  const submit = () => {
    if (!file) return;
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 9000);
    start(async () => {
      const fd = new FormData();
      fd.set("cv", file);
      const r = await uploadCvAction(fd);
      clearInterval(timer);
      setResult(r);
    });
  };

  if (result?.ok) {
    const username = result.username;
    return (
      <div className="space-y-6">
        <Card className="border-accent/30 bg-accent-soft p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="flex-1">
              <h2 className="font-medium text-accent">Your master profile and live microsite are ready.</h2>
              <p className="mt-1 text-sm text-accent/80">
                {result.counts.experience} roles, {result.counts.projects} case studies and {result.counts.skills} skills captured.{" "}
                {result.matches > 0
                  ? `${result.matches} matching job${result.matches === 1 ? "" : "s"} added to your pipeline.`
                  : "No matching jobs in the pool yet — paste a job URL or add companies to your watchlist."}
              </p>
              {result.matchError && <p className="mt-2 text-sm text-warn">{result.matchError}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/dashboard" className={buttonClass("primary", "sm")}>
                  Open My Job Pipeline
                </Link>
                <Link href={`/${username}`} target="_blank" className={buttonClass("secondary", "sm")}>
                  Preview My Live Microsite (/{username})
                </Link>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-1 font-medium">Quick review</h3>
          <p className="mb-5 text-sm text-muted">Tweak how you appear publicly. Full CV data is editable later under Profile.</p>
          <form
            action={(fd) =>
              startSave(async () => {
                const r = await saveBasicsAction(fd);
                setSaveState(r);
                if (r.ok && r.username) setResult({ ...result, username: r.username, fullName: String(fd.get("full_name") ?? result.fullName) });
              })
            }
            className="grid gap-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="username">Microsite URL</Label>
                <div className="flex items-center rounded-lg border border-line bg-paper pl-3 text-sm text-muted">
                  <span className="truncate">{appUrl.replace(/^https?:\/\//, "")}/</span>
                  <Input id="username" name="username" defaultValue={username} className="rounded-l-none border-0 border-l" />
                </div>
              </div>
              <div>
                <Label htmlFor="availability_status">Availability</Label>
                <select id="availability_status" name="availability_status" defaultValue={result.availability} className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm">
                  {AVAILABILITY_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" name="full_name" defaultValue={result.fullName} required />
            </div>
            <div>
              <Label htmlFor="headline">Headline</Label>
              <Input id="headline" name="headline" defaultValue={result.headline} />
            </div>
            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" name="bio" defaultValue={result.bio} rows={4} />
            </div>
            <div className="flex items-center gap-3">
              <Button disabled={savePending}>{savePending ? "Saving…" : "Save"}</Button>
              {saveState?.ok && <span className="text-sm text-accent">Saved.</span>}
              {saveState?.error && <span className="text-sm text-warn">{saveState.error}</span>}
            </div>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        onClick={() => !pending && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition",
          drag ? "border-accent bg-accent-soft" : "border-line hover:border-ink/30",
          pending && "pointer-events-none opacity-70",
        )}
      >
        <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {file ? <FileText className="mb-3 size-8 text-accent" /> : <UploadCloud className="mb-3 size-8 text-muted" />}
        <p className="font-medium">{file ? file.name : "Drop your CV here, or click to browse"}</p>
        <p className="mt-1 text-sm text-muted">{file ? `${(file.size / 1024).toFixed(0)} KB` : "PDF or DOCX, up to 4MB"}</p>
      </div>

      {result && !result.ok && <p className="mt-4 text-sm text-warn">{result.error}</p>}

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> {STEPS[step]}
            </span>
          ) : hasProfile ? (
            "Uploading again refreshes your master profile. Your username and availability are kept."
          ) : (
            "Takes about 30–60 seconds. Every fact is taken from your CV — nothing invented."
          )}
        </p>
        <Button onClick={submit} disabled={!file || pending}>
          {pending ? "Parsing…" : "Build my profile"}
        </Button>
      </div>
    </Card>
  );
}
