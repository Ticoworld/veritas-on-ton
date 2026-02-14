import { mkdir, readdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const SCREENSHOTS_DIR = path.join(process.cwd(), "public", "screenshots");
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generates a Microlink URL for capturing screenshots
 * @param url The URL to screenshot
 * @param fullPage Whether to capture the full page or just the viewport
 */
const SCREENSHOT_TIMEOUT_MS = 5000;

export function getMicrolinkUrl(url: string, fullPage: boolean = false): string {
  const params = new URLSearchParams({
    url: url,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
    waitForTimeout: "5000",
    waitUntil: "networkidle0",
  });

  // JPEG + 800px width: smaller payload, faster upload/model processing (Microlink type = jpeg|png)
  params.append("screenshot.type", "jpeg");

  if (fullPage) {
    params.append("viewport.width", "800");
    params.append("viewport.height", "2000");
    params.append("screenshot.fullPage", "true");
  } else {
    params.append("viewport.width", "800");
    params.append("viewport.height", "1200");
  }

  return `https://api.microlink.io/?${params.toString()}`;
}

/**
 * Generates a Microlink URL specifically for a Twitter/X profile
 * This is a workaround to "see" the profile without expensive APIs
 */
export function getTwitterScreenshotUrl(handleOrUrl: string): string {
  let handle = handleOrUrl;
  
  // Extract handle if full URL is provided
  if (handleOrUrl.includes("twitter.com/") || handleOrUrl.includes("x.com/")) {
    const parts = handleOrUrl.split("/");
    handle = parts[parts.length - 1].split("?")[0];
  }
  
  // Remove @ if present
  handle = handle.replace("@", "");
  
  const twitterUrl = `https://twitter.com/${handle}`;
  
  // For Twitter, we want the viewport, not full page, to focus on bio/stats
  return getMicrolinkUrl(twitterUrl, false);
}

export interface ScreenshotResult {
  base64: string;
  mimeType: string;
  /** Set when saveToDisk is true; public URL e.g. /screenshots/scan-{uuid}.png */
  publicUrl?: string;
}

/**
 * Saves a screenshot to public dir with a unique filename to avoid race conditions.
 * Returns the public URL for the saved file.
 */
export async function saveScreenshotToPublicDir(
  base64: string,
  mimeType: string,
  prefix: "website" | "twitter" = "website"
): Promise<{ path: string; publicUrl: string }> {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const filename = `scan-${prefix}-${randomUUID()}.${ext}`;
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  const buffer = Buffer.from(base64, "base64");
  await writeFile(filePath, buffer);
  const publicUrl = `/screenshots/${filename}`;
  return { path: filePath, publicUrl };
}

/**
 * Deletes screenshots older than 1 hour to save disk space.
 * @returns Number of files deleted
 */
export async function cleanupOldScreenshots(): Promise<number> {
  try {
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
    const files = await readdir(SCREENSHOTS_DIR);
    const now = Date.now();
    let deleted = 0;
    for (const f of files) {
      const fp = path.join(SCREENSHOTS_DIR, f);
      const st = await stat(fp).catch(() => null);
      if (st?.mtimeMs && now - st.mtimeMs > MAX_AGE_MS) {
        await unlink(fp).catch(() => {});
        deleted++;
      }
    }
    if (deleted > 0) {
      console.warn(`[Veritas Paparazzi] Cleaned up ${deleted} screenshot(s) older than 1h`);
    }
    return deleted;
  } catch {
    return 0;
  }
}

/**
 * Fetches the screenshot image and returns it as base64 (and optionally saves to disk).
 * Uses unique filenames (scan-{prefix}-{uuid}.png) when saving to avoid race conditions.
 */
export async function fetchScreenshotAsBase64(
  url: string,
  options?: { saveToDisk?: boolean; prefix?: "website" | "twitter" }
): Promise<ScreenshotResult | null> {
  try {
    console.log("[Veritas Paparazzi] 📸 Snapping photo...");
    const fetchUrl = url.includes("api.microlink.io") ? url : getMicrolinkUrl(url);
    const response = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(SCREENSHOT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn("[Veritas Paparazzi] Failed to capture screenshot:", response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/jpeg";

    console.log(`[Veritas Paparazzi] Image captured (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);

    let publicUrl: string | undefined;
    if (options?.saveToDisk && process.env.VERITAS_SAVE_SCREENSHOTS === "true") {
      await cleanupOldScreenshots();
      const prefix = options.prefix ?? "website";
      const { publicUrl: url } = await saveScreenshotToPublicDir(base64, mimeType, prefix);
      publicUrl = url;
    }

    return { base64, mimeType, ...(publicUrl && { publicUrl }) };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[Veritas Paparazzi] Screenshot timeout (5s) — skipping");
    } else {
      console.warn("[Veritas Paparazzi] Camera malfunction:", error);
    }
    return null;
  }
}
