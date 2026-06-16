import { NextResponse } from "next/server";
import { isAdminConfigured, isAdminSessionValid } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [configured, authenticated] = await Promise.all([isAdminConfigured(), isAdminSessionValid()]);
    return NextResponse.json({ setupRequired: !configured, authenticated });
  } catch (error) {
    console.error("Admin status error", error);
    return NextResponse.json({ error: "Admin nao configurado no servidor." }, { status: 500 });
  }
}
