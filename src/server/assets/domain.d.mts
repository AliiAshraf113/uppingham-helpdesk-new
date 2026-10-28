export type AssetStatus = "in_stock" | "assigned" | "maintenance" | "retired";
export type AssetInput = {
  assetTag: string;
  assetTypeId: number;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  purchaseDate: string | null;
  warrantyExpiresOn: string | null;
};
export function validateAssetInput(input: unknown): { ok: true; value: AssetInput } | { ok: false; error: string };
export function validateAssetList(input?: Record<string, unknown>): { ok: true; value: { status: AssetStatus | ""; search: string; page: number; pageSize: number } } | { ok: false; error: string };
export function validateRetirementReason(reason: unknown): { ok: true; value: string } | { ok: false; error: string };
