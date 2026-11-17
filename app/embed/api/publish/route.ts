// Mismos endpoints que /api/meta/publish, bajo /embed para que usen la sesión particionada del iframe.
import { GET as baseGet, POST as basePost } from "@/app/api/meta/publish/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = baseGet;
export const POST = basePost;
