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

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dispatches")
    .insert({ invoice_number: invoiceNumber })
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
