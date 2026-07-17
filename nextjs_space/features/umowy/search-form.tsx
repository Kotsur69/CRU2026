"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface Dict {
  id: string;
  name: string;
}
interface Dicts {
  documentTypes: Dict[];
  statuses: Dict[];
  companies: Dict[];
  locations: Dict[];
  domains: Dict[];
  natures: Dict[];
  businesslines: Dict[];
  contractors: Dict[];
  owners: Dict[];
}

const PAGE_SIZES = [10, 15, 25, 50, 100, 250, 500];

function Select({
  name, label, options, defaultValue,
}: { name: string; label: string; options: Dict[]; defaultValue: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="rounded-md border border-input px-2 py-1.5 text-sm"
      >
        <option value="">— wszystkie —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  name, label, defaultValue, type = "text",
}: { name: string; label: string; defaultValue: string; type?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        className="rounded-md border border-input px-2 py-1.5 text-sm"
      />
    </label>
  );
}

export function SearchForm({ dicts }: { dicts: Dicts }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(true);
  const g = (k: string) => params.get(k) ?? "";

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string" && v.trim() !== "") next.set(k, v.trim());
    }
    next.set("page", "1");
    router.push(`/umowy?${next.toString()}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 rounded-lg border bg-card p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Wyszukiwanie</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {open ? "Zwiń" : "Rozwiń"}
        </button>
      </div>

      {open && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <TextField name="identifier" label="Identyfikator" defaultValue={g("identifier")} />
            <Select name="type" label="Typ dokumentu" options={dicts.documentTypes} defaultValue={g("type")} />
            <TextField name="contractNumber" label="Numer umowy" defaultValue={g("contractNumber")} />
            <Select name="businessline" label="Businessline" options={dicts.businesslines} defaultValue={g("businessline")} />
            <Select name="status" label="Status" options={dicts.statuses} defaultValue={g("status")} />
            <Select name="company" label="Spółka" options={dicts.companies} defaultValue={g("company")} />

            <Select name="location" label="Lokalizacja" options={dicts.locations} defaultValue={g("location")} />
            <Select name="contractor" label="Kontrahenci" options={dicts.contractors} defaultValue={g("contractor")} />
            <Select name="owner" label="Właściciel umowy" options={dicts.owners} defaultValue={g("owner")} />
            <Select name="domain" label="Rodzaj umowy" options={dicts.domains} defaultValue={g("domain")} />
            <Select name="nature" label="Charakter umowy" options={dicts.natures} defaultValue={g("nature")} />
            <TextField name="nip" label="NIP" defaultValue={g("nip")} />

            <TextField name="dateEnd" label="Data zakończenia (do)" type="date" defaultValue={g("dateEnd")} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="obsc" value="1" defaultChecked={g("obsc") === "1"} />
              Tylko OBSC
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="companyConnected" value="1" defaultChecked={g("companyConnected") === "1"} />
              Podmiot powiązane
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Na stronie</span>
              <select
                name="pageSize"
                defaultValue={g("pageSize") || "25"}
                className="rounded-md border border-input px-2 py-1 text-sm"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => router.push("/umowy")}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Wyczyść
              </button>
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Szukaj
              </button>
            </div>
          </div>
        </>
      )}
    </form>
  );
}
