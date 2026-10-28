export const TICKET_STATUSES = Object.freeze([
  "new",
  "open",
  "in_progress",
  "pending",
  "resolved",
  "closed",
]);

const TRANSITIONS = Object.freeze({
  new: ["open"],
  open: ["in_progress", "pending", "resolved"],
  in_progress: ["pending", "resolved"],
  pending: ["open", "in_progress", "resolved"],
  resolved: ["open", "closed"],
  closed: [],
});

function positiveInteger(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function validateTicketInput(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "Ticket details are required." };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const categoryId = positiveInteger(input.categoryId);
  const priority = input.priority;
  const assetId = input.assetId === undefined || input.assetId === null || input.assetId === ""
    ? null
    : positiveInteger(input.assetId);

  if (!title || title.length > 255) return { ok: false, error: "Enter a title of 1 to 255 characters." };
  if (!description || description.length > 20_000) return { ok: false, error: "Enter a description of 1 to 20,000 characters." };
  if (categoryId === null) return { ok: false, error: "Choose a valid ticket category." };
  if (!["urgent", "high", "medium", "low"].includes(priority)) return { ok: false, error: "Choose a valid priority." };
  if (input.assetId !== undefined && input.assetId !== null && input.assetId !== "" && assetId === null) return { ok: false, error: "Choose a valid asset." };
  return { ok: true, value: { title, description, categoryId, priority, assetId } };
}

export function canTransition(from, to) {
  return TICKET_STATUSES.includes(from) && TRANSITIONS[from].includes(to);
}

export function validateTicketSearch(input) {
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const status = input.status || "";
  const pageValue = input.page === undefined || input.page === "" ? 1
    : typeof input.page === "string" && !/^[1-9]\d{0,4}$/.test(input.page) ? Number.NaN
      : Number(input.page);
  const page = pageValue;
  if (search.length > 100) return { ok: false, error: "Search text must be 100 characters or fewer." };
  if (status && !TICKET_STATUSES.includes(status)) return { ok: false, error: "Choose a valid status filter." };
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) return { ok: false, error: "Page must be between 1 and 10,000." };
  return { ok: true, value: { search, status, page, pageSize: 25 } };
}
