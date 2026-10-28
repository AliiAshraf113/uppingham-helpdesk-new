export type TicketPriority = "urgent" | "high" | "medium" | "low";
export type TicketStatus = "new" | "open" | "in_progress" | "pending" | "resolved" | "closed";
export type TicketInput = { title: string; description: string; categoryId: number | string; priority: TicketPriority; assetId?: number | string | null };
export type TicketSearch = { search?: string; status?: string; page?: number | string };
export declare const TICKET_STATUSES: readonly TicketStatus[];
export declare function validateTicketInput(input: unknown): { ok: false; error: string } | { ok: true; value: { title: string; description: string; categoryId: number; priority: TicketPriority; assetId: number | null } };
export declare function canTransition(from: string, to: string): boolean;
export declare function validateTicketSearch(input: TicketSearch): { ok: false; error: string } | { ok: true; value: { search: string; status: string; page: number; pageSize: number } };
