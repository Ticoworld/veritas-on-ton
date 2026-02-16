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
const SCREENSHOT_TIMEOUT_MS = 15000;
const FALLBACK_TIMEOUT_MS = 12000;

export function getMicrolinkUrl(url: string, fullPage: boolean = false): string {
  const params = new URLSearchParams({
    url: url,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
    waitForTimeout: "12000",
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
  prefix: "website" = "website"
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
 * Fallback: fetch screenshot via Thum.io when Microlink fails or times out.
 * Returns base64 image or null.
 */
async function fetchViaThumIo(originalUrl: string): Promise<ScreenshotResult | null> {
  try {
    const thumUrl = `https://image.thum.io/get/width/1200/crop/800/${encodeURIComponent(originalUrl)}`;
    const response = await fetch(thumUrl, {
      signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    console.log(`[Veritas Paparazzi] Fallback (Thum.io) captured (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);
    return { base64, mimeType };
  } catch {
    return null;
  }
}

/**
 * Fetches the screenshot image and returns it as base64 (and optionally saves to disk).
 * Tries Microlink first (15s timeout); on failure falls back to Thum.io.
 */
export async function fetchScreenshotAsBase64(
  url: string,
  options?: { saveToDisk?: boolean; prefix?: "website"; originalUrl?: string }
): Promise<ScreenshotResult | null> {
  const originalUrl = options?.originalUrl ?? (url.includes("api.microlink.io") ? undefined : url);

  try {
    console.log("[Veritas Paparazzi] 📸 Snapping photo...");
    const fetchUrl = url.includes("api.microlink.io") ? url : getMicrolinkUrl(url);
    const response = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(SCREENSHOT_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Microlink ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/jpeg";

    console.log(`[Veritas Paparazzi] Image captured (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);

    let publicUrl: string | undefined;
    if (options?.saveToDisk && process.env.VERITAS_SAVE_SCREENSHOTS === "true") {
      await cleanupOldScreenshots();
      const prefix = options.prefix ?? "website";
      const { publicUrl: savedUrl } = await saveScreenshotToPublicDir(base64, mimeType, prefix);
      publicUrl = savedUrl;
    }

    return { base64, mimeType, ...(publicUrl && { publicUrl }) };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[Veritas Paparazzi] Microlink timeout (15s) — trying fallback");
    } else {
      console.warn("[Veritas Paparazzi] Microlink failed, falling back to secondary screenshot service:", error instanceof Error ? error.message : error);
    }
    if (originalUrl) {
      const fallback = await fetchViaThumIo(originalUrl);
      if (fallback) return fallback;
    }
    console.warn("[Veritas Paparazzi] Fallback screenshot also failed — no image for this source");
    return null;
  }
}
