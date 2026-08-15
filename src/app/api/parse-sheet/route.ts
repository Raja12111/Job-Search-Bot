import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseCityTable } from "@/lib/cities";
import type { CityRow } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const fallback = form.get("country");
  const fallbackCountry =
    fallback === "gb" || fallback === "uk" ? "gb" : fallback === "us" ? "us" : undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a CSV or Excel file." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  let text = "";

  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    text = buffer.toString("utf8");
  } else {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) {
      return NextResponse.json({ error: "The spreadsheet is empty." }, { status: 400 });
    }
    text = XLSX.utils.sheet_to_csv(sheet);
  }

  const cities: CityRow[] = parseCityTable(text, fallbackCountry);
  return NextResponse.json({ count: cities.length, cities });
}
