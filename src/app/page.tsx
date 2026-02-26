"use client";

import { useMemo, useState } from "react";

type Brief = {
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
};

type AdVariant = {
  id: string;
  angle: string;
  hook: string;
  primary: string;
  headline: string;
  description: string;
  cta: string;
  creative: string;
};

type ImageResult = {
  data: string;
  mimeType: string;
};

const toneOptions = [
  "Direct",
  "Playful",
  "Premium",
  "Urgent",
  "Educational",
  "Minimal",
];

const objectiveOptions = [
  "Conversions",
  "Leads",
  "Traffic",
  "App Installs",
  "Awareness",
];

const angleOptions = [
  "Pain Relief",
  "Outcome Driven",
  "Social Proof",
  "Scarcity",
  "Curiosity",
  "Speed",
];

const creativeFrames = [
  "Bold headline + product close-up",
  "Split-screen before/after",
  "UGC selfie testimonial frame",
  "Checklist overlay with 3 benefits",
  "Minimal product + offer badge",
  "Carousel: problem → solution → proof",
];

const defaultBrief: Brief = {
  brand: "",
  product: "",
  offer: "",
  audience: "",
  tone: "Direct",
  objective: "Conversions",
  landingPage: "",
  keyBenefits: "",
  objections: "",
  cta: "Get started",
  budget: "$50/day",
};

const creditsPerAd = 1;
const adsPerSprint = 6;

function pick(list: string[], seed: number) {
  return list[seed % list.length];
}

function generateAds(brief: Brief, count: number) {
  const base = `${brief.product || "your product"}`;
  const offer = brief.offer ? ` ${brief.offer}` : "";
  const audience = brief.audience ? ` for ${brief.audience}` : "";
  const benefit = brief.keyBenefits || "faster workflows, cleaner output";
  const objection = brief.objections || "time, complexity, cost";

  return Array.from({ length: count }).map((_, index) => {
    const angle = pick(angleOptions, index + 2);
    const tone = pick(toneOptions, index + 3);
    const creative = pick(creativeFrames, index + 5);
    const hook = `${angle}: ${base} that fixes ${objection}.`;
    const primary = `${base}${audience} that delivers ${benefit}.${offer} ${tone} CTA: ${brief.cta}.`;
    const headline = `${base} ${brief.objective.toLowerCase()} engine${offer}`;
    const description = `Built for ${brief.objective.toLowerCase()} teams. Ship in 24 hours.`;

    return {
      id: `ad-${index + 1}`,
      angle,
      hook,
      primary,
      headline,
      description,
      cta: brief.cta || "Get started",
      creative,
    };
  });
}

function toCsv(ads: AdVariant[]) {
  const headers = [
    "id",
    "angle",
    "hook",
    "primary",
    "headline",
    "description",
    "cta",
    "creative",
  ];
  const rows = ads.map((ad) =>
    headers
      .map((key) => `"${String(ad[key as keyof AdVariant]).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildImagePrompt(ad: AdVariant, brief: Brief) {
  const brand = brief.brand || "the brand";
  const product = brief.product || "the product";
  const offer = brief.offer ? `Offer: ${brief.offer}.` : "";
  const tone = brief.tone ? `Tone: ${brief.tone}.` : "";
  const audience = brief.audience ? `Audience: ${brief.audience}.` : "";

  return `Create a high-converting Meta feed ad creative. Brand: ${brand}. Product: ${product}. ${offer} ${tone} ${audience} Use a bold headline and leave safe margins for text. Visual concept: ${ad.creative}. Headline concept: ${ad.headline}.`; 
}

export default function Home() {
  const [brief, setBrief] = useState<Brief>(defaultBrief);
  const [ads, setAds] = useState<AdVariant[]>([]);
  const [credits, setCredits] = useState(120);
  const [status, setStatus] = useState("Ready for sprint");
  const [images, setImages] = useState<Record<string, ImageResult>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const canGenerate = credits >= adsPerSprint * creditsPerAd;

  const summary = useMemo(() => {
    return {
      generated: ads.length,
      remaining: Math.max(credits, 0),
      spend: ads.length * creditsPerAd,
    };
  }, [ads, credits]);

  const onGenerate = () => {
    if (!canGenerate) {
      setStatus("Not enough credits. Top up to run a sprint.");
      return;
    }
    const next = generateAds(brief, adsPerSprint);
    setAds(next);
    setCredits((prev) => prev - adsPerSprint * creditsPerAd);
    setStatus("Sprint complete. Review and export.");
  };

  const onGenerateImage = async (ad: AdVariant) => {
    setLoadingId(ad.id);
    setImageError(null);

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildImagePrompt(ad, brief),
          aspectRatio: "4:5",
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data?.error ?? "Image generation failed.");
      }

      const data = (await response.json()) as ImageResult;
      setImages((prev) => ({ ...prev, [ad.id]: data }));
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "Image generation failed."
      );
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen px-6 py-10">
      <main className="mx-auto flex max-w-6xl flex-col gap-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-[var(--stroke)] bg-[var(--surface)]/80 p-8 shadow-[0_30px_60px_rgba(7,9,15,0.55)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-black font-semibold">
                SA
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">
                  Sprint Ads Studio
                </p>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Build Meta ads in a 24-hour sprint
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--muted)]">
                Credits: <span className="text-white">{credits}</span>
              </div>
              <button className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition hover:brightness-110">
                New sprint
              </button>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Status</p>
              <p className="mt-2 text-lg font-medium">{status}</p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Ads this sprint</p>
              <p className="mt-2 text-lg font-medium">{adsPerSprint} variations</p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Credit burn</p>
              <p className="mt-2 text-lg font-medium">{adsPerSprint * creditsPerAd} credits</p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_1.4fr]">
          <div className="flex flex-col gap-6 rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Brief intake</p>
                <h2 className="mt-2 text-2xl font-semibold">Sprint brief</h2>
              </div>
              <span className="rounded-full border border-[var(--stroke)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--muted)]">
                Meta focus
              </span>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm text-[var(--muted)]">Brand name</label>
                <input
                  value={brief.brand}
                  onChange={(event) =>
                    setBrief((prev) => ({ ...prev, brand: event.target.value }))
                  }
                  className="rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white placeholder:text-[var(--muted)]"
                  placeholder="Sprint Ads"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-[var(--muted)]">Product / service</label>
                <input
                  value={brief.product}
                  onChange={(event) =>
                    setBrief((prev) => ({ ...prev, product: event.target.value }))
                  }
                  className="rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white placeholder:text-[var(--muted)]"
                  placeholder="AI ad sprint platform"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-[var(--muted)]">Offer</label>
                <input
                  value={brief.offer}
                  onChange={(event) =>
                    setBrief((prev) => ({ ...prev, offer: event.target.value }))
                  }
                  className="rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white placeholder:text-[var(--muted)]"
                  placeholder="Try 10 credits free"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-[var(--muted)]">Target audience</label>
                <input
                  value={brief.audience}
                  onChange={(event) =>
                    setBrief((prev) => ({ ...prev, audience: event.target.value }))
                  }
                  className="rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white placeholder:text-[var(--muted)]"
                  placeholder="In-house growth teams"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm text-[var(--muted)]">Tone</label>
                  <select
                    value={brief.tone}
                    onChange={(event) =>
                      setBrief((prev) => ({ ...prev, tone: event.target.value }))
                    }
                    className="rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white"
                  >
                    {toneOptions.map((tone) => (
                      <option key={tone} value={tone} className="text-black">
                        {tone}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-[var(--muted)]">Objective</label>
                  <select
                    value={brief.objective}
                    onChange={(event) =>
                      setBrief((prev) => ({ ...prev, objective: event.target.value }))
                    }
                    className="rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white"
                  >
                    {objectiveOptions.map((objective) => (
                      <option key={objective} value={objective} className="text-black">
                        {objective}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-[var(--muted)]">Key benefits</label>
                <textarea
                  value={brief.keyBenefits}
                  onChange={(event) =>
                    setBrief((prev) => ({ ...prev, keyBenefits: event.target.value }))
                  }
                  className="min-h-[90px] rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white placeholder:text-[var(--muted)]"
                  placeholder="Ship 6 ad angles in 10 minutes"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-[var(--muted)]">Main objections</label>
                <textarea
                  value={brief.objections}
                  onChange={(event) =>
                    setBrief((prev) => ({ ...prev, objections: event.target.value }))
                  }
                  className="min-h-[80px] rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white placeholder:text-[var(--muted)]"
                  placeholder="Too expensive, too manual, too slow"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-[var(--muted)]">Landing page</label>
                <input
                  value={brief.landingPage}
                  onChange={(event) =>
                    setBrief((prev) => ({ ...prev, landingPage: event.target.value }))
                  }
                  className="rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white placeholder:text-[var(--muted)]"
                  placeholder="https://sprintads.ai"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm text-[var(--muted)]">Primary CTA</label>
                  <input
                    value={brief.cta}
                    onChange={(event) =>
                      setBrief((prev) => ({ ...prev, cta: event.target.value }))
                    }
                    className="rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white placeholder:text-[var(--muted)]"
                    placeholder="Book a demo"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-[var(--muted)]">Budget hint</label>
                  <input
                    value={brief.budget}
                    onChange={(event) =>
                      setBrief((prev) => ({ ...prev, budget: event.target.value }))
                    }
                    className="rounded-2xl border border-[var(--stroke)] bg-transparent px-4 py-3 text-sm text-white placeholder:text-[var(--muted)]"
                    placeholder="$100/day"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={onGenerate}
                className={`rounded-full px-6 py-3 text-sm font-semibold text-black transition ${
                  canGenerate
                    ? "bg-[var(--accent)] hover:brightness-110"
                    : "bg-[var(--muted)]"
                }`}
              >
                Generate sprint ads
              </button>
              <p className="text-xs text-[var(--muted)]">
                {canGenerate
                  ? "6 ads x 1 credit each"
                  : "Top up credits to run the next sprint."}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Output</p>
                  <h2 className="mt-2 text-2xl font-semibold">Meta ad pack</h2>
                </div>
                <button
                  onClick={() => downloadCsv("sprint-ads.csv", toCsv(ads))}
                  disabled={!ads.length}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                    ads.length
                      ? "bg-[var(--accent-2)] text-black hover:brightness-110"
                      : "bg-[var(--panel-2)] text-[var(--muted)]"
                  }`}
                >
                  Export CSV
                </button>
              </div>

              {imageError ? (
                <div className="mt-4 rounded-2xl border border-[var(--danger)]/40 bg-[var(--panel-2)] p-4 text-sm text-[var(--danger)]">
                  {imageError}
                </div>
              ) : null}

              {ads.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-[var(--stroke)] p-6 text-sm text-[var(--muted)]">
                  Your generated ads will appear here. Fill the brief and run a sprint.
                </div>
              ) : (
                <div className="mt-6 grid gap-4">
                  {ads.map((ad) => {
                    const image = images[ad.id];
                    const isLoading = loadingId === ad.id;

                    return (
                      <div
                        key={ad.id}
                        className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-2)] p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                            {ad.angle}
                          </p>
                          <span className="rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--muted)]">
                            {ad.id}
                          </span>
                        </div>
                        <h3 className="mt-3 text-lg font-semibold">{ad.headline}</h3>
                        <p className="mt-3 text-sm text-[var(--muted)]">{ad.primary}</p>
                        <div className="mt-4 grid gap-2 text-sm">
                          <div>
                            <span className="text-[var(--muted)]">Hook:</span> {ad.hook}
                          </div>
                          <div>
                            <span className="text-[var(--muted)]">Description:</span> {ad.description}
                          </div>
                          <div>
                            <span className="text-[var(--muted)]">CTA:</span> {ad.cta}
                          </div>
                          <div>
                            <span className="text-[var(--muted)]">Creative:</span> {ad.creative}
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3">
                          <button
                            onClick={() => onGenerateImage(ad)}
                            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                              isLoading
                                ? "bg-[var(--panel)] text-[var(--muted)]"
                                : "bg-[var(--accent)] text-black hover:brightness-110"
                            }`}
                            disabled={isLoading}
                          >
                            {isLoading ? "Generating creative..." : "Generate creative"}
                          </button>
                          {image ? (
                            <div className="overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--panel)]">
                              <img
                                src={`data:${image.mimeType};base64,${image.data}`}
                                alt={`Creative for ${ad.id}`}
                                className="h-auto w-full"
                              />
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-[var(--stroke)] bg-[var(--panel)] p-4 text-xs text-[var(--muted)]">
                              Creative preview will render here (4:5 Meta feed).
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid gap-4 rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-2)] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Generated</p>
                <p className="mt-2 text-2xl font-semibold">{summary.generated}</p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-2)] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Credits left</p>
                <p className="mt-2 text-2xl font-semibold">{summary.remaining}</p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-2)] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Spend</p>
                <p className="mt-2 text-2xl font-semibold">{summary.spend}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)]/80 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Sprint board</p>
              <h2 className="mt-2 text-2xl font-semibold">From brief to export</h2>
            </div>
            <span className="rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 py-1 text-xs text-[var(--muted)]">
              Solo workflow
            </span>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              {
                title: "Brief",
                desc: "Collect inputs, goals, audience, offer.",
                stat: "7 fields",
              },
              {
                title: "Draft",
                desc: "Generate hooks, headlines, body, creative frames.",
                stat: "6 ads",
              },
              {
                title: "Review",
                desc: "Tighten tone, swap angles, refine CTA.",
                stat: "15 mins",
              },
              {
                title: "Export",
                desc: "Download CSV + creative notes for Meta.",
                stat: "1 click",
              },
            ].map((step) => (
              <div
                key={step.title}
                className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-4"
              >
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">{step.desc}</p>
                <p className="mt-3 text-xs text-[var(--accent)]">{step.stat}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
