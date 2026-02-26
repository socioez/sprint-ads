import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type GenerateCopyRequest = {
  brief: {
    brand: string;
    product: string;
    offer: string;
    audience: string;
    tone: string;
    objective: string;
    landingPage: string;
    keyBenefits: string;
    objections: string;
    cta: string;
    budget: string;
    productUrl?: string;
  };
  count: number;
};

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchProductText(url: string) {
  try {
    const response = await fetchWithTimeout(url, 8000);
    if (!response.ok) return "";
    const html = await response.text();
    return stripHtml(html).slice(0, 2000);
  } catch {
    return "";
  }
}

function extractJson(text: string) {
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last === -1) return "";
  return text.slice(first, last + 1);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Missing GEMINI_API_KEY" },
        { status: 500 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as GenerateCopyRequest;
    if (!body?.brief) {
      return Response.json({ error: "Brief is required." }, { status: 400 });
    }

    const creditsNeeded = Math.max(body.count ?? 0, 1);
    const { data: creditRow, error: creditError } = await supabase
      .from("credits")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (creditError || !creditRow) {
      return Response.json(
        { error: "Credits not initialized." },
        { status: 500 }
      );
    }

    if (creditRow.balance < creditsNeeded) {
      return Response.json({ error: "Not enough credits." }, { status: 402 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.0-flash";

    const productText = body.brief.productUrl
      ? await fetchProductText(body.brief.productUrl)
      : "";

    const prompt = `You are an expert performance copywriter for Meta ads.\n\nCreate ${body.count} ad variants using this brief. If a field is missing, infer carefully from the product context. If still missing, leave it neutral.\n\nReturn ONLY a JSON array of objects with keys: id, angle, hook, primary, headline, description, cta, creative.\n\nBrief:\n${JSON.stringify(body.brief, null, 2)}\n\nProduct context (from URL):\n${productText || "Not provided."}`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text =
      response.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    const jsonText = extractJson(text) || text;
    const parsed = JSON.parse(jsonText);

    const { data: updatedCredits } = await supabase
      .from("credits")
      .update({ balance: creditRow.balance - creditsNeeded })
      .eq("user_id", user.id)
      .select("balance")
      .single();

    await supabase.from("usage_events").insert({
      user_id: user.id,
      type: "copy",
      credits_used: creditsNeeded,
      meta: { count: body.count },
    });

    return Response.json({
      ads: parsed,
      creditsRemaining: updatedCredits?.balance ?? creditRow.balance,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Copy generation failed.";
    console.error("Gemini copy generation error:", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
