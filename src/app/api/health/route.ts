import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", stage: 1 }, { headers: { "Cache-Control": "no-store" } });
}
