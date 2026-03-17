import { mkdir, readdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const SCREENSHOTS_DIR = path.join(process.cwd(), "public", "screenshots");
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const SCREENSHOTONE_TIMEOUT_MS = 25000;
const MICROLINK_TIMEOUT_MS = 30000;

/**
 * Generates screenshot URLs for supported capture providers.
 */
export function getScreenshotOneUrl(
  url: string,
  fullPage: boolean = false,
): string {
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

export function getMicrolinkUrl(
  url: string,
  fullPage: boolean = false,
): string {
  const params = new URLSearchParams({
    url,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
    waitForTimeout: "12000",
    waitUntil: "networkidle0",
  });

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
  publicUrl?: string;
}

/**
 * Save a screenshot to the public directory with a unique filename.
 */
export async function saveScreenshotToPublicDir(
  base64: string,
  mimeType: string,
  prefix: "website" = "website",
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
 * Delete screenshots older than one hour to limit disk growth.
 */
export async function cleanupOldScreenshots(): Promise<number> {
  try {
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
    const files = await readdir(SCREENSHOTS_DIR);
    const now = Date.now();
    let deleted = 0;

    for (const file of files) {
      const filePath = path.join(SCREENSHOTS_DIR, file);
      const fileStat = await stat(filePath).catch(() => null);
      if (fileStat?.mtimeMs && now - fileStat.mtimeMs > MAX_AGE_MS) {
        await unlink(filePath).catch(() => {});
        deleted++;
      }
    }

    if (deleted > 0) {
      console.warn(
        `[Screenshot] Cleaned up ${deleted} screenshot(s) older than 1h`,
      );
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
    // Ignore parse errors and use the original input.
  }
  return url;
}

/**
 * Fetch a screenshot image and return it as base64.
 * ScreenshotOne is preferred when configured; Microlink is the fallback.
 */
export async function fetchScreenshotAsBase64(
  url: string,
  options?: {
    saveToDisk?: boolean;
    prefix?: "website";
    originalUrl?: string;
    fullPage?: boolean;
  },
): Promise<ScreenshotResult | null> {
  const originalUrl = options?.originalUrl ?? extractTargetUrl(url);
  const fullPage =
    options?.fullPage ??
    (url.includes("fullPage=true") || url.includes("screenshot.fullPage=true"));
  const useScreenshotOne = Boolean(process.env.SCREENSHOTONE_ACCESS_KEY);

  const maybeSave = async (
    result: ScreenshotResult,
  ): Promise<ScreenshotResult> => {
    let publicUrl: string | undefined;
    if (options?.saveToDisk && process.env.VERITAS_SAVE_SCREENSHOTS === "true") {
      await cleanupOldScreenshots();
      const prefix = options.prefix ?? "website";
      const { publicUrl: savedUrl } = await saveScreenshotToPublicDir(
        result.base64,
        result.mimeType,
        prefix,
      );
      publicUrl = savedUrl;
    }

    return { ...result, ...(publicUrl && { publicUrl }) };
  };

  if (useScreenshotOne) {
    try {
      const screenshotOneUrl = getScreenshotOneUrl(originalUrl, fullPage);
      console.log(
        `[Screenshot] Capturing via ScreenshotOne (${SCREENSHOTONE_TIMEOUT_MS}ms deadline)...`,
      );

      const response = await fetch(screenshotOneUrl, {
        signal: AbortSignal.timeout(SCREENSHOTONE_TIMEOUT_MS),
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = response.headers.get("content-type") || "image/jpeg";
        console.log(
          `[Screenshot] ScreenshotOne captured (${Math.round(arrayBuffer.byteLength / 1024)}KB)`,
        );
        return await maybeSave({ base64, mimeType });
      }

      console.warn(
        `[Screenshot] ScreenshotOne HTTP ${response.status} - falling back to Microlink`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout =
        err instanceof Error &&
        (err.name === "AbortError" || err.name === "TimeoutError");
      console.warn(
        `[Screenshot] ScreenshotOne ${isTimeout ? "timed out" : `error: ${msg}`} - falling back to Microlink`,
      );
    }
  }

  try {
    const microlinkUrl = getMicrolinkUrl(originalUrl, fullPage);
    console.log(
      `[Screenshot] Capturing via Microlink fallback (${MICROLINK_TIMEOUT_MS}ms deadline)...`,
    );

    const response = await fetch(microlinkUrl, {
      signal: AbortSignal.timeout(MICROLINK_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Microlink HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/jpeg";

    console.log(
      `[Screenshot] Microlink captured (${Math.round(arrayBuffer.byteLength / 1024)}KB)`,
    );
    return await maybeSave({ base64, mimeType });
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError");
    console.warn(
      `[Screenshot] Microlink ${isTimeout ? "timed out" : `error: ${err instanceof Error ? err.message : err}`} - no visual evidence`,
    );
    return null;
  }
}
