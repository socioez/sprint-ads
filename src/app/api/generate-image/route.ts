import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ReferenceImage = {
  data: string;
  mimeType: string;
};

type GenerateRequest = {
  prompt: string;
  aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9";
  productUrl?: string;
  referenceImage?: ReferenceImage;
  referenceImageUrl?: string;
};

type ProductContext = {
  text: string;
  ogImage: string;
};

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html: string, key: string) {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(pattern);
  return match ? match[1] : "";
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

async function fetchProductContext(url: string): Promise<ProductContext> {
  try {
    const response = await fetchWithTimeout(url, 8000);
    if (!response.ok) return { text: "", ogImage: "" };
    const html = await response.text();
    const text = stripHtml(html).slice(0, 2000);
    const ogImage =
      extractMeta(html, "og:image") ||
      extractMeta(html, "twitter:image") ||
      "";
    return { text, ogImage };
  } catch {
    return { text: "", ogImage: "" };
  }
}

async function fetchImageAsBase64(url: string) {
  try {
    const response = await fetchWithTimeout(url, 8000);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    return { data: buffer.toString("base64"), mimeType: contentType };
  } catch {
    return null;
  }
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

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    if (creditRow.balance < 1) {
      return Response.json({ error: "Not enough credits." }, { status: 402 });
    }

    const body = (await request.json()) as GenerateRequest;
    if (!body?.prompt) {
      return Response.json(
        { error: "Prompt is required." },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const model =
      process.env.GEMINI_IMAGE_MODEL ?? "gemini-3-pro-image-preview";

    const productContext = body.productUrl
      ? await fetchProductContext(body.productUrl)
      : { text: "", ogImage: "" };

    const imageParts: { inlineData: ReferenceImage }[] = [];

    if (body.referenceImage?.data && body.referenceImage?.mimeType) {
      imageParts.push({
        inlineData: {
          data: body.referenceImage.data,
          mimeType: body.referenceImage.mimeType,
        },
      });
    } else if (body.referenceImageUrl) {
      const fetched = await fetchImageAsBase64(body.referenceImageUrl);
      if (fetched) {
        imageParts.push({ inlineData: fetched });
      }
    } else if (productContext.ogImage) {
      const fetched = await fetchImageAsBase64(productContext.ogImage);
      if (fetched) {
        imageParts.push({ inlineData: fetched });
      }
    }

    const enrichedPrompt = productContext.text
      ? `${body.prompt}\n\nProduct context (from URL): ${productContext.text}`
      : body.prompt;

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ text: enrichedPrompt }, ...imageParts],
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: body.aspectRatio ?? "1:1",
          imageSize: "2K",
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData);
    if (!imagePart?.inlineData?.data) {
      return Response.json(
        { error: "No image returned from model." },
        { status: 502 }
      );
    }

    const { data: updatedCredits } = await supabase
      .from("credits")
      .update({ balance: creditRow.balance - 1 })
      .eq("user_id", user.id)
      .select("balance")
      .single();

    await supabase.from("usage_events").insert({
      user_id: user.id,
      type: "image",
      credits_used: 1,
      meta: { aspectRatio: body.aspectRatio ?? "1:1" },
    });

    return Response.json({
      data: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
      creditsRemaining: updatedCredits?.balance ?? creditRow.balance,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image generation failed.";
    console.error("Gemini image generation error:", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
