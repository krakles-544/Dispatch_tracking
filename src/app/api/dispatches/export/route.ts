import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dispatches")
    .select("id, invoice_number, started_at, first_arrived_at, last_arrived_at")
    .not("last_arrived_at", "is", null)
    .order("started_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dispatch Log";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Dispatch Log", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").value = "Vintage Interiors Kenya · Dispatch Desk";
  sheet.getCell("A1").font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF1E2420" } };

  sheet.mergeCells("A2:F2");
  sheet.getCell("A2").value = "Dispatch Log";
  sheet.getCell("A2").font = { name: "Calibri", size: 11, color: { argb: "FF5B6259" } };
  sheet.getCell("A2").value = `Exported ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;

  const headerRow = sheet.getRow(4);
  const headers = ["Date", "Invoice #", "Dispatched", "First Arrived", "Last Arrived", "Duration"];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF35578A" } };
    cell.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "left" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD9DACE" } },
      bottom: { style: "thin", color: { argb: "FFD9DACE" } },
    };
  });
  headerRow.height = 20;

  sheet.columns = [
    { key: "date", width: 16 },
    { key: "invoice", width: 16 },
    { key: "out", width: 12 },
    { key: "firstIn", width: 14 },
    { key: "lastIn", width: 14 },
    { key: "duration", width: 14 },
  ];

  function fmtDuration(ms: number) {
    const totalMin = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    const parts: string[] = [];
    if (d > 0) parts.push(d + "d");
    if (h > 0) parts.push(h + "h");
    if (m > 0 || parts.length === 0) parts.push(m + "m");
    return parts.join(" ");
  }

  (data || []).forEach((r, i) => {
    const rowIndex = 5 + i;
    const row = sheet.getRow(rowIndex);
    const started = new Date(r.started_at as string);
    const firstIn = r.first_arrived_at ? new Date(r.first_arrived_at as string) : null;
    const lastIn = new Date(r.last_arrived_at as string);

    row.getCell(1).value = started;
    row.getCell(1).numFmt = "ddd dd mmm yyyy";

    row.getCell(2).value = "INV-" + r.invoice_number;
    row.getCell(2).font = { name: "Consolas", size: 11 };

    row.getCell(3).value = started;
    row.getCell(3).numFmt = "HH:MM";

    row.getCell(4).value = firstIn;
    row.getCell(4).numFmt = "HH:MM";

    row.getCell(5).value = lastIn;
    row.getCell(5).numFmt = "HH:MM";

    row.getCell(6).value = fmtDuration(+lastIn - +started);

    for (let c = 1; c <= 6; c++) {
      row.getCell(c).border = {
        bottom: { style: "thin", color: { argb: "FFEEF0EA" } },
      };
      if (i % 2 === 1) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F4EE" } };
      }
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `dispatch-log-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
