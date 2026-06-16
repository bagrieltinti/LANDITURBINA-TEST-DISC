import { NextResponse } from "next/server";
import { isAdminSessionValid } from "@/lib/admin-auth";
import { listAllTests } from "@/lib/disc-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!(await isAdminSessionValid())) {
      return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
    }

    const tests = await listAllTests();
    return NextResponse.json({ tests });
  } catch (error) {
    console.error("Admin list tests error", error);
    return NextResponse.json({ error: "Nao foi possivel carregar os testes." }, { status: 500 });
  }
}
