import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

type GenerateRequest = {
  prompt: string;
  aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9";
};

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

    const response = await ai.models.generateContent({
      model,
      contents: body.prompt,
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
    return Response.json(
      { error: message },
      { status: 502 }
    );
  }
}
