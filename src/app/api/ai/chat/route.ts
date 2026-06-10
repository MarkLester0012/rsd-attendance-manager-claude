import { z } from "zod";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createChatCompletionStream,
  AI_MODEL,
  AI_MAX_TOKENS,
} from "@/lib/ai/client";
import { formatContextAsMarkdown } from "@/lib/ai/format-context";

export const runtime = "edge";

// Per-request limits to bound cost & prevent abuse
const MAX_CONTEXT_CHARS = 8000;
const MAX_MESSAGES = 20;
const MAX_TOTAL_CONTENT_CHARS = 12_000;
const MAX_PAGE_TITLE_CHARS = 200;
const REQUEST_TIMEOUT_MS = 30_000;

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const COMPANY_HR_RULES = `
COMPANY HR POLICIES & RULES:
1. Leave Types that deduct balance: VL (Vacation Leave), PL (Paternity Leave), ML (Maternity Leave), SPL (Special Leave), SL (Sick Leave), AB (Absent).
2. Leave Types that DO NOT deduct balance: NW (No Work), RGA (RGA Office), WFH (Work From Home).
3. Approvals: All leaves require approval EXCEPT for "No Work" (NW) and "RGA Office" (RGA) which are auto-approved.
4. Half-days: Supported for AM or PM.
5. Limits: WFH has a strict monthly cap per user and a daily global cap across all users. HR users have unlimited leave balance.
`;

const TRANSPORTATION_ALLOWANCE_RULES = `
TRANSPORTATION ALLOWANCE RULES:
1. One snapshot per employee per month; payment is on the 15th of the following month.
2. Effective days = days_worked - undertime_days + (undertime_days × 0.5). days_worked = business_days - wfh_days - leave_days.
3. Default rates: Car ₱95/8km/L @ 50%, Motorcycle ₱95/25km/L @ 80%, Walk ₱80/km @ 100% (only if distance ≤ 2.4km AND no vehicle owned), Jeep ₱15/ride @ 100%, Bus ₱20/ride @ 100%, Work From Home ₱120/day @ 100% (capped at 8 days/month, always additive).
4. Car/Motorcycle/Walk and primary Jeep/Bus use effective_days; Jeep/Bus as a SECONDARY/additive mode use days_worked instead.
5. HR can override unit_price, gas_mileage, or refund_pct per mode via snapshot config.
6. Locked snapshots cannot be edited; each snapshot allows at most one pending change request.
`;

interface UserProfile {
  name: string;
  role: string;
  department: { name: string } | null;
}

function buildSystemPrompt(
  pageTitle: string | undefined,
  contextData: unknown,
  profile: UserProfile | null
): string {
  const contextMd = contextData
    ? formatContextAsMarkdown(contextData as Record<string, unknown>).slice(0, MAX_CONTEXT_CHARS)
    : null;

  return [
    "You are an intelligent, highly efficient HR/Attendance assistant built into the RSD Attendance Manager app.",
    "Your personality is helpful, direct, and conversational but professional—like a smart coworker. Do NOT sound like a robotic AI.",
    profile
      ? `You are speaking with ${profile.name} (role: ${profile.role}${profile.department?.name ? `, department: ${profile.department.name}` : ""}).`
      : "",
    COMPANY_HR_RULES,
    pageTitle === "Transportation Allowance" ? TRANSPORTATION_ALLOWANCE_RULES : "",
    pageTitle
      ? `Context: The user is currently viewing the "${pageTitle.slice(0, MAX_PAGE_TITLE_CHARS)}" page.`
      : "",
    contextMd
      ? `Here is the current page data:\n${contextMd}`
      : "No specific page data is currently available.",
    "CRITICAL INSTRUCTIONS:",
    "1. DO NOT mention 'JSON', 'the data provided', 'your dashboard data', or 'the information I have access to'. Speak naturally as if you simply know the answers.",
    "2. Be concise. Do not give long-winded explanations or offer unsolicited options (e.g., do not say 'Would you like me to read the other 9?'). Give the user exactly what they ask for, no fluff.",
    "3. Only answer using the data provided above. Do not hallucinate or guess. If you don't have the answer in the context, politely state you don't have that specific information right now.",
    "4. When helpful, use short bullet lists or bold text to structure your answer. Keep responses scannable.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Zod schema — rejects system role (jailbreak vector); assistant history is valid continuity
const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const RequestSchema = z.object({
  pageTitle: z.string().max(MAX_PAGE_TITLE_CHARS).optional(),
  contextData: z.unknown().optional(),
  messages: z
    .array(ChatMessageSchema)
    .min(1)
    .max(MAX_MESSAGES)
    .refine(
      (msgs) =>
        msgs.reduce((sum, m) => sum + m.content.length, 0) <=
        MAX_TOTAL_CONTENT_CHARS,
      { message: "Total message content too large" }
    ),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("name, role, department:departments(name)")
    .eq("auth_id", authUser.id)
    .single<UserProfile>();

  // Safe body parse with descriptive 400s
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Bad request", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const { pageTitle, contextData, messages } = parsed.data;
  const systemPrompt = buildSystemPrompt(pageTitle, contextData, profile ?? null);

  // Server-side timeout so a hung upstream doesn't hold the edge function
  const abort = new AbortController();
  const timeoutId = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);

  const { stream, error } = await createChatCompletionStream(
    {
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: AI_MODEL,
      maxTokens: AI_MAX_TOKENS,
      signal: abort.signal,
    },
    [{ role: "system", content: systemPrompt }, ...messages]
  );

  clearTimeout(timeoutId);

  if (error || !stream) {
    return jsonResponse({ error: error ?? "AI request failed" }, 502);
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
