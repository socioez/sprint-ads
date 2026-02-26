import { GoogleGenAI } from "@google/genai";

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
    const text = stripHtml(html);
    return text.slice(0, 2000);
  } catch {
    return "";
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

    const productText = body.productUrl
      ? await fetchProductText(body.productUrl)
      : "";

    const imageParts: { inlineData: ReferenceImage }[] = [];

    if (body.referenceImage?.data && body.referenceImage?.mimeType) {
      imageParts.push({
        inlineData: {
          data: body.referenceImage.data,
          mimeType: body.referenceImage.mimeType,
        },
      });
    }

    if (!imageParts.length && body.referenceImageUrl) {
      const fetched = await fetchImageAsBase64(body.referenceImageUrl);
      if (fetched) {
        imageParts.push({ inlineData: fetched });
      }
    }

    const enrichedPrompt = productText
      ? `${body.prompt}\n\nProduct context (from URL): ${productText}`
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

    return Response.json({
      data: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image generation failed.";
    console.error("Gemini image generation error:", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
