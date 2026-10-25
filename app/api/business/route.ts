import { NextResponse } from "next/server";
import { readData, updateBusiness } from "@/lib/store";
import type { BusinessProfile } from "@/lib/types";

const fields: (keyof Omit<BusinessProfile, "updatedAt">)[] = [
  "name",
  "industry",
  "description",
  "audience",
  "tone",
  "offer",
  "faq",
  "knowledge",
];

export async function GET() {
  const data = await readData();
  return NextResponse.json(data.business);
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Partial<BusinessProfile> = {};

  for (const field of fields) {
    if (typeof body[field] === "string") {
      patch[field] = body[field] as never;
    }
  }

  const business = await updateBusiness(patch);
  return NextResponse.json(business);
}
