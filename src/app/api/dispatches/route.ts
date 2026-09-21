import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dispatches")
    .select("id, note, started_at, arrived_at")
    .order("started_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ dispatches: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note) {
    return NextResponse.json({ error: "note is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dispatches")
    .insert({ note })
    .select("id, note, started_at, arrived_at")
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
