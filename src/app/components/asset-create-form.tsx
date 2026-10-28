"use client";

import { useState, type FormEvent } from "react";

type AssetType = { id: number; keyName: string; name: string };

export function AssetCreateForm({ assetTypes, onCreated }: { assetTypes: AssetType[]; onCreated?: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setIsSuccess(false);

    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
      assetTag: String(data.get("assetTag") || "").trim(),
      assetTypeId: Number(data.get("assetTypeId")),
      serialNumber: String(data.get("serialNumber") || "").trim() || null,
      manufacturer: String(data.get("manufacturer") || "").trim() || null,
      model: String(data.get("model") || "").trim() || null,
      purchaseDate: String(data.get("purchaseDate") || "").trim() || null,
      warrantyExpiresOn: String(data.get("warrantyExpiresOn") || "").trim() || null,
    };

    try {
      const response = await fetch("/helpdesk/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(
          response.status === 401
            ? "Your session expired. Sign in again."
            : response.status === 403
            ? "Your account is not permitted to register assets."
            : result.error === "authentication_unavailable"
            ? "Sign-in is not configured yet."
            : result.error || "The asset could not be registered. Please check the inputs."
        );
        return;
      }
      setIsSuccess(true);
      setMessage(`Asset registered successfully (ID: ${result.assetId}).`);
      form.reset();
      if (onCreated) {
        onCreated();
      } else {
        window.location.reload();
      }
    } catch {
      setMessage("The Helpdesk could not be reached. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">
        Asset Tag *
        <input
          name="assetTag"
          required
          maxLength={100}
          placeholder="e.g. UPP-LAP-0042"
          className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium">
        Asset Type *
        <select
          name="assetTypeId"
          required
          className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal"
        >
          <option value="">Select equipment type</option>
          {assetTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm font-medium">
        Serial Number
        <input
          name="serialNumber"
          maxLength={160}
          placeholder="e.g. 5CD1234XYZ"
          className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium">
        Manufacturer
        <input
          name="manufacturer"
          maxLength={160}
          placeholder="e.g. Dell, Apple, Lenovo"
          className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium">
        Model
        <input
          name="model"
          maxLength={160}
          placeholder="e.g. Latitude 5420, MacBook Pro 14"
          className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium">
        Purchase Date (YYYY-MM-DD)
        <input
          name="purchaseDate"
          type="date"
          className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium">
        Warranty Expiry (YYYY-MM-DD)
        <input
          name="warrantyExpiresOn"
          type="date"
          className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal"
        />
      </label>

      <div className="sm:col-span-2 flex flex-col gap-2 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="justify-self-start rounded-lg bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Registering…" : "Register Asset"}
        </button>
        {message && (
          <p
            role="alert"
            className={`text-sm ${isSuccess ? "text-emerald-700 font-medium" : "text-red-800"}`}
          >
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
