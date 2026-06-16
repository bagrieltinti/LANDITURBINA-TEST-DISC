import { NextResponse } from "next/server";
import { findTestsByLead } from "@/lib/disc-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const nomeCompleto = searchParams.get("name") || "";
    const telefone = searchParams.get("phone") || "";

    if (!nomeCompleto && !telefone) {
      return NextResponse.json({ tests: [] });
    }

    const tests = await findTestsByLead({ nomeCompleto, telefone });
    const summaries = tests.slice(0, 20).map((test) => ({
      id: test.id,
      timestamp: test.timestamp,
      leadData: test.leadData,
      normalizedName: test.normalizedName,
      normalizedNameKey: test.normalizedNameKey,
      phoneDigits: test.phoneDigits,
      percentages: test.percentages,
      primaryProfile: test.primaryProfile,
      secondaryProfile: test.secondaryProfile,
    }));
    return NextResponse.json({ tests: summaries });
  } catch (error) {
    console.error("Lookup error", error);
    return NextResponse.json({ error: "Nao foi possivel buscar testes anteriores." }, { status: 500 });
  }
}
