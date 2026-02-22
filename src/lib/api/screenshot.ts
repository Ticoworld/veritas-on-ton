import { mkdir, readdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const SCREENSHOTS_DIR = path.join(process.cwd(), "public", "screenshots");
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generates screenshot URLs for capture providers
 * @param url The URL to screenshot
 * @param fullPage Whether to capture the full page or just the viewport
 */
const SCREENSHOTONE_TIMEOUT_MS = 25000; // must exceed the timeout param sent to ScreenshotOne API (15s page load + overhead)
const MICROLINK_TIMEOUT_MS = 30000;  // must exceed waitForTimeout param (12s) + Microlink processing overhead

export function getScreenshotOneUrl(url: string, fullPage: boolean = false): string {
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY;
  if (!accessKey) {
    throw new Error("SCREENSHOTONE_ACCESS_KEY is not configured");
  }

  const params = new URLSearchParams({
    access_key: accessKey,
    url,
    format: "jpeg",
    image_quality: "80",
    viewport_width: "800",
    viewport_height: fullPage ? "2000" : "1200",
    block_ads: "true",
    block_cookie_banners: "true",
    block_trackers: "true",
    delay: "0",
    timeout: "15",
  });

  if (fullPage) {
    params.append("full_page", "true");
  }

  return `https://api.screenshotone.com/take?${params.toString()}`;
}

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

function extractTargetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("api.microlink.io")) {
      const embeddedUrl = parsed.searchParams.get("url");
      if (embeddedUrl) {
        return embeddedUrl;
      }
    }
  } catch {
    // Ignore parse errors and use input directly
  }
  return url;
}

/**
 * Fetches the screenshot image and returns it as base64 (and optionally saves to disk).
 * Uses ScreenshotOne first when configured, then falls back to Microlink.
 */
export async function fetchScreenshotAsBase64(
  url: string,
  options?: { saveToDisk?: boolean; prefix?: "website"; originalUrl?: string; fullPage?: boolean }
): Promise<ScreenshotResult | null> {
  const originalUrl = options?.originalUrl ?? extractTargetUrl(url);
  const fullPage =
    options?.fullPage ??
    (url.includes("fullPage=true") || url.includes("screenshot.fullPage=true"));
  const useScreenshotOne = Boolean(process.env.SCREENSHOTONE_ACCESS_KEY);

  const maybeSave = async (result: ScreenshotResult): Promise<ScreenshotResult> => {
    let publicUrl: string | undefined;
    if (options?.saveToDisk && process.env.VERITAS_SAVE_SCREENSHOTS === "true") {
      await cleanupOldScreenshots();
      const prefix = options.prefix ?? "website";
      const { publicUrl: savedUrl } = await saveScreenshotToPublicDir(result.base64, result.mimeType, prefix);
      publicUrl = savedUrl;
    }
    return { ...result, ...(publicUrl && { publicUrl }) };
  };

  // --- ScreenshotOne (primary) ---
  if (useScreenshotOne) {
    try {
      const screenshotOneUrl = getScreenshotOneUrl(originalUrl, fullPage);
      console.log(`[Veritas Paparazzi] 📸 Snapping via ScreenshotOne (${SCREENSHOTONE_TIMEOUT_MS}ms deadline)...`);

      const response = await fetch(screenshotOneUrl, {
        signal: AbortSignal.timeout(SCREENSHOTONE_TIMEOUT_MS),
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = response.headers.get("content-type") || "image/jpeg";
        console.log(`[Veritas Paparazzi] ScreenshotOne captured (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);
        return await maybeSave({ base64, mimeType });
      }

      console.warn(`[Veritas Paparazzi] ScreenshotOne HTTP ${response.status} — falling back to Microlink`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      console.warn(`[Veritas Paparazzi] ScreenshotOne ${isTimeout ? "timed out" : `error: ${msg}`} — falling back to Microlink`);
    }
  }

  // --- Microlink (fallback) ---
  try {
    const microlinkUrl = getMicrolinkUrl(originalUrl, fullPage);
    console.log(`[Veritas Paparazzi] 📸 Snapping via Microlink fallback (${MICROLINK_TIMEOUT_MS}ms deadline)...`);

    const response = await fetch(microlinkUrl, {
      signal: AbortSignal.timeout(MICROLINK_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Microlink HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/jpeg";

    console.log(`[Veritas Paparazzi] Microlink captured (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);
    return await maybeSave({ base64, mimeType });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    console.warn(`[Veritas Paparazzi] Microlink ${isTimeout ? "timed out" : `error: ${err instanceof Error ? err.message : err}`} — no visual evidence`);
    return null;
  }
}
