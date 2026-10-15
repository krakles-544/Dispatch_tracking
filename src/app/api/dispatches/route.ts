import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dispatches")
    .select("id, invoice_number, started_at, first_arrived_at, last_arrived_at")
    .order("started_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ dispatches: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const invoiceNumber = typeof body?.invoice_number === "string" ? body.invoice_number.trim() : "";
  if (!invoiceNumber) {
    return NextResponse.json({ error: "invoice_number is required" }, { status: 400 });
  }

  // Manual entries may supply their own timestamps; live dispatches omit them.
  const insert: { invoice_number: string; started_at?: string; first_arrived_at?: string; last_arrived_at?: string } =
    { invoice_number: invoiceNumber };
  for (const key of ["started_at", "first_arrived_at", "last_arrived_at"] as const) {
    const value = body?.[key];
    if (value == null || value === "") continue;
    const ms = typeof value === "string" ? Date.parse(value) : NaN;
    if (Number.isNaN(ms)) {
      return NextResponse.json({ error: `${key} is not a valid date` }, { status: 400 });
    }
    insert[key] = new Date(ms).toISOString();
  }
  if (insert.last_arrived_at && !insert.first_arrived_at) {
    return NextResponse.json({ error: "first_arrived_at is required when last_arrived_at is set" }, { status: 400 });
  }
  if ((insert.first_arrived_at || insert.last_arrived_at) && !insert.started_at) {
    return NextResponse.json({ error: "started_at is required when arrival times are set" }, { status: 400 });
  }
  const order = [insert.started_at, insert.first_arrived_at, insert.last_arrived_at].filter(Boolean) as string[];
  if (order.some((t, i) => i > 0 && t < order[i - 1])) {
    return NextResponse.json({ error: "times must be in order: dispatched ≤ first arrived ≤ last arrived" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dispatches")
    .insert(insert)
    .select("id, invoice_number, started_at, first_arrived_at, last_arrived_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ dispatch: data }, { status: 201 });
}

export async function DELETE() {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("dispatches")
    .delete()
    .not("id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
