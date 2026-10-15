import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const action = body?.action;
  if (action !== "first-arrive" && action !== "last-arrive") {
    return NextResponse.json({ error: "unsupported action" }, { status: 400 });
  }

  // Manual corrections may pass `at`; otherwise the arrival is stamped now.
  let at = new Date().toISOString();
  if (body?.at != null && body.at !== "") {
    const ms = typeof body.at === "string" ? Date.parse(body.at) : NaN;
    if (Number.isNaN(ms)) {
      return NextResponse.json({ error: "at is not a valid date" }, { status: 400 });
    }
    at = new Date(ms).toISOString();
  }

  const supabase = getSupabaseAdmin();
  const { data: current, error: readError } = await supabase
    .from("dispatches")
    .select("started_at, first_arrived_at")
    .eq("id", id)
    .single();
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 404 });
  }

  let update: { first_arrived_at?: string; last_arrived_at?: string };
  if (action === "first-arrive") {
    if (at < new Date(current.started_at).toISOString()) {
      return NextResponse.json({ error: "first arrival can't be before dispatch time" }, { status: 400 });
    }
    update = { first_arrived_at: at };
  } else {
    if (!current.first_arrived_at) {
      return NextResponse.json({ error: "first arrival must be recorded first" }, { status: 400 });
    }
    if (at < new Date(current.first_arrived_at).toISOString()) {
      return NextResponse.json({ error: "last arrival can't be before first arrival" }, { status: 400 });
    }
    update = { last_arrived_at: at };
  }

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
