import { NextResponse } from "next/server";

const FILES: Record<string, string> = {
  "us-cities.csv": `City,State,Country
New York,NY,US
Los Angeles,CA,US
Chicago,IL,US
Houston,TX,US
Phoenix,AZ,US
Philadelphia,PA,US
San Antonio,TX,US
San Diego,CA,US
Dallas,TX,US
Austin,TX,US
`,
  "uk-cities.csv": `City,State,Country
London,,UK
Manchester,,UK
Birmingham,,UK
Leeds,,UK
Glasgow,,UK
Liverpool,,UK
Bristol,,UK
Edinburgh,,UK
Sheffield,,UK
Newcastle,,UK
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
