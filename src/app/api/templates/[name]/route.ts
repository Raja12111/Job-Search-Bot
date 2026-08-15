import { NextResponse } from "next/server";

const FILES: Record<string, string> = {
  "us-cities.csv": `City,State
New York,NY
Los Angeles,CA
Chicago,IL
Houston,TX
Phoenix,AZ
Philadelphia,PA
San Antonio,TX
San Diego,CA
Dallas,TX
Austin,TX
`,
  "uk-cities.csv": `City
London
Manchester
Birmingham
Leeds
Glasgow
Liverpool
Bristol
Edinburgh
Sheffield
Newcastle
`,
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  const body = FILES[name];
  if (!body) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
