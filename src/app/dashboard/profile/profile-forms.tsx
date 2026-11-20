"use client";

import { useActionState } from "react";
import { saveMasterAction, saveProfileAction } from "./actions";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { ProfileRow } from "@/lib/jobs";
import type { MasterData } from "@/lib/ai/schemas";
import { AVAILABILITY_OPTIONS, cn } from "@/lib/utils";

export function ProfileForms({ profile, master, appUrl }: { profile: ProfileRow; master: MasterData; appUrl: string }) {
  const [pState, pAction, pPending] = useActionState(saveProfileAction, null);
  const [mState, mAction, mPending] = useActionState(saveMasterAction, null);
  const social = profile.social_links ?? {};
  const avail = profile.availability_status ?? "";

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <h2 className="mb-5 font-medium">Public profile</h2>
        <form action={pAction} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="full_name" defaultValue={profile.full_name} required />
            <div>
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" defaultValue={profile.username} required />
              <p className="mt-1 truncate text-[11px] text-muted">
                {appUrl.replace(/^https?:\/\//, "")}/{profile.username}
              </p>
            </div>
          </div>
          <Field label="Headline" name="headline" defaultValue={profile.headline ?? ""} />
          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" name="bio" defaultValue={profile.bio ?? ""} rows={4} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" name="location" defaultValue={profile.location ?? ""} />
            <div>
              <Label htmlFor="availability_status">Availability</Label>
              <Input id="availability_status" name="availability_status" list="avail" defaultValue={avail} />
              <datalist id="avail">
                {AVAILABILITY_OPTIONS.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
          </div>
          <Field label="Contact email (shown publicly)" name="contact_email" type="email" defaultValue={profile.contact_email ?? ""} />
          <Field label="Target roles (comma separated)" name="target_roles" defaultValue={(profile.target_roles ?? []).join(", ")} />
          <div>
            <Label>Preferred organisation types</Label>
            <div className="flex flex-wrap gap-3 text-sm">
              {["agency", "indie", "publisher", "client"].map((t) => (
                <label key={t} className="inline-flex items-center gap-1.5 capitalize">
                  <input type="checkbox" name="preferred_org_types" value={t} defaultChecked={(profile.preferred_org_types ?? []).includes(t)} /> {t}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {["website", "linkedin", "instagram", "behance"].map((k) => (
              <Field key={k} label={k} name={`social_${k}`} defaultValue={social[k] ?? ""} placeholder="https://" />
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_public" defaultChecked={profile.is_public} /> Microsite is public
          </label>
          <Status state={pState} />
          <Button disabled={pPending} className="justify-self-start">
            {pPending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 font-medium">Master profile JSON</h2>
        <p className="mb-4 text-sm text-muted">
          Edit roles, highlights, projects and tags directly. Project <code className="font-mono text-xs">tags</code> drive the filter pills on your microsite; keep <code className="font-mono text-xs">id</code>s unique.
        </p>
        <form action={mAction} className="space-y-3">
          <Textarea name="structured_data" defaultValue={JSON.stringify(master, null, 2)} rows={34} spellCheck={false} className="font-mono text-xs leading-relaxed" />
          <Status state={mState} />
          <Button disabled={mPending}>{mPending ? "Saving…" : "Save master profile"}</Button>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, name, ...rest }: { label: string; name: string } & React.ComponentProps<"input">) {
  return (
    <div>
      <Label htmlFor={name} className="capitalize">
        {label}
      </Label>
      <Input id={name} name={name} {...rest} />
    </div>
  );
}

function Status({ state }: { state: { ok: boolean; message?: string; error?: string } | null }) {
  if (!state) return null;
  return <p className={cn("text-sm", state.ok ? "text-accent" : "text-warn")}>{state.ok ? state.message : state.error}</p>;
}
