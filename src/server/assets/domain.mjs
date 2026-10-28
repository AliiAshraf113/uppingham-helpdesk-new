function positiveInteger(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function optionalText(value, maximum, field) {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || value.trim().length > maximum) return { ok: false, error: `${field} is invalid.` };
  return { ok: true, value: value.trim() || null };
}

function validDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}

export function validateAssetInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Asset details are required." };
  const assetTag = typeof input.assetTag === "string" ? input.assetTag.trim() : "";
  const assetTypeId = positiveInteger(input.assetTypeId);
  if (!assetTag || assetTag.length > 100) return { ok: false, error: "Asset tag must contain 1 to 100 characters." };
  if (assetTypeId === null) return { ok: false, error: "Choose a valid asset type." };

  const fields = [
    ["serialNumber", 160, "Serial number"],
    ["manufacturer", 160, "Manufacturer"],
    ["model", 160, "Model"],
  ];
  const normalized = {};
  for (const [key, maximum, label] of fields) {
    const result = optionalText(input[key], maximum, label);
    if (!result.ok) return result;
    normalized[key] = result.value;
  }
  const purchaseDate = validDate(input.purchaseDate);
  const warrantyExpiresOn = validDate(input.warrantyExpiresOn);
  if (purchaseDate === undefined || warrantyExpiresOn === undefined) return { ok: false, error: "Dates must be valid YYYY-MM-DD values." };
  if (purchaseDate && warrantyExpiresOn && warrantyExpiresOn < purchaseDate) return { ok: false, error: "Warranty expiry cannot be before purchase date." };

  return { ok: true, value: { assetTag, assetTypeId, ...normalized, purchaseDate, warrantyExpiresOn } };
}

export function validateAssetList(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Asset filters are invalid." };
  const status = input.status ?? "";
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const page = input.page === undefined || input.page === "" ? 1 : Number(input.page);
  if (status && !["in_stock", "assigned", "maintenance", "retired"].includes(status)) return { ok: false, error: "Choose a valid asset status." };
  if (search.length > 100) return { ok: false, error: "Search text must be 100 characters or fewer." };
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) return { ok: false, error: "Page must be between 1 and 10,000." };
  return { ok: true, value: { status, search, page, pageSize: 25 } };
}

export function validateRetirementReason(reason) {
  if (typeof reason !== "string") return { ok: false, error: "A retirement reason is required." };
  const value = reason.trim();
  if (!value || value.length > 1000) return { ok: false, error: "Retirement reason must contain 1 to 1,000 characters." };
  return { ok: true, value };
}
