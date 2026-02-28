import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.findIndex((a) => a === name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
};

const keyword = getArg("--keyword", "Pool");
const country = getArg("--country", "United States");
const headless = getArg("--headless", "false") === "true";
const maxProfiles = Number(getArg("--max", "0"));
const baseUrl = getArg("--url", "https://www.bniconnectglobal.com/login/");
const searchUrl = getArg(
  "--search-url",
  "https://www.bniconnectglobal.com/web/dashboard/search"
);

const OUTPUT_DIR = path.resolve("outputs");
const STATE_PATH = path.resolve("outputs", "bni-storage.json");

const selectors = {
  searchNav: /search/i,
  filtersButton: /filters/i,
  keywordInput: /keyword/i,
  countryInput: /country/i,
  searchMembersButton: /search members/i,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitize(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((row) => headers.map((h) => escape(row[h])).join(","));
  return [headers.join(","), ...lines].join("\n");
}

async function ensureLogin(page) {
  const needsLogin =
    (await page.locator('input[type="password"]').count()) > 0 ||
    (await page.locator("text=/login/i").count()) > 0;

  if (!needsLogin) return;

  console.log("Login required. Please log in in the opened browser.");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  await rl.question("Press Enter after you finish logging in...");
  rl.close();
}

async function gotoSearch(page, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const stillLogin =
      (await page.locator('input[type="password"]').count()) > 0 ||
      (await page.locator("text=/login/i").count()) > 0;
    if (!stillLogin) return true;
    await sleep(1000);
  }
  return false;
}

async function getProfileLinks(page) {
  const links = await page.$$eval("a[href]", (anchors) =>
    anchors
      .map((a) => a.href)
      .filter((href) => /member|profile/i.test(href))
  );
  return Array.from(new Set(links));
}

async function scrapeProfile(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(500);

  const data = await page.evaluate(() => {
    const pickText = (sel) =>
      document.querySelector(sel)?.textContent?.trim() ?? "";
    const headings = Array.from(
      document.querySelectorAll("h1, h2, h3")
    ).map((el) => el.textContent?.trim() ?? "");
    const emails = Array.from(
      document.querySelectorAll('a[href^="mailto:"]')
    ).map((a) => a.getAttribute("href")?.replace("mailto:", "") ?? "");
    const phones = Array.from(document.querySelectorAll("a[href^='tel:']")).map(
      (a) => a.getAttribute("href")?.replace("tel:", "") ?? ""
    );
    const websites = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => /^https?:\/\//i.test(href));

    const text = document.body?.innerText ?? "";
    return {
      name: pickText("h1") || headings[0] || "",
      title: headings[1] || "",
      emails,
      phones,
      websites,
      rawText: text,
    };
  });

  const phoneMatch = data.rawText.match(/\+?\d[\d\s().-]{7,}\d/);
  const email = data.emails[0] ?? "";
  const phone = data.phones[0] ?? phoneMatch?.[0] ?? "";
  const website =
    data.websites.find((href) => !/bni|connect/i.test(href)) ?? "";

  return {
    url,
    name: sanitize(data.name),
    title: sanitize(data.title),
    email: sanitize(email),
    phone: sanitize(phone),
    website: sanitize(website),
    rawText: sanitize(data.rawText),
  };
}

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless });
  const context = fs.existsSync(STATE_PATH)
    ? await browser.newContext({ storageState: STATE_PATH })
    : await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseUrl, {
    waitUntil: "domcontentloaded",
  });

  await ensureLogin(page);
  await context.storageState({ path: STATE_PATH });

  const ok = await gotoSearch(page, searchUrl);
  if (!ok) {
    console.error(
      "Could not reach search page after login. Verify login success and try again."
    );
    await browser.close();
    process.exit(1);
  }

  await page.getByRole("link", { name: selectors.searchNav }).click();
  await page.getByRole("button", { name: selectors.filtersButton }).click();
  await page.getByRole("textbox", { name: selectors.keywordInput }).fill(keyword);
  await page.getByRole("textbox", { name: selectors.countryInput }).fill(country);
  await page.getByRole("button", { name: selectors.searchMembersButton }).click();

  await page.waitForLoadState("networkidle");
  await sleep(1000);

  const profileLinks = await getProfileLinks(page);
  console.log(`Found ${profileLinks.length} profile links.`);

  const results = [];
  const limit = maxProfiles > 0 ? Math.min(maxProfiles, profileLinks.length) : profileLinks.length;

  for (let i = 0; i < limit; i += 1) {
    const url = profileLinks[i];
    console.log(`Scraping ${i + 1}/${limit}: ${url}`);
    try {
      const profile = await scrapeProfile(page, url);
      results.push(profile);
    } catch (error) {
      console.error(`Failed to scrape ${url}`, error);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(OUTPUT_DIR, `bni-members-${stamp}.json`);
  const csvPath = path.join(OUTPUT_DIR, `bni-members-${stamp}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(csvPath, toCsv(results));

  console.log(`Saved ${results.length} profiles`);
  console.log(jsonPath);
  console.log(csvPath);

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
