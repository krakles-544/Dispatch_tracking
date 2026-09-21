import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  let update: { first_arrived_at?: string; last_arrived_at?: string };
  if (body?.action === "first-arrive") {
    update = { first_arrived_at: new Date().toISOString() };
  } else if (body?.action === "last-arrive") {
    update = { last_arrived_at: new Date().toISOString() };
  } else {
    return NextResponse.json({ error: "unsupported action" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dispatches")
    .update(update)
    .eq("id", id)
    .select("id, invoice_number, started_at, first_arrived_at, last_arrived_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ dispatch: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("dispatches").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
