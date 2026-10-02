import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolveUserPath, slugify } from "../config.js";

const execAsync = promisify(exec);

/** Android/Termux specific paths used for gallery integration. */
const ANDROID_PICTURES_DIR = "/sdcard/Pictures";
const TERMUX_BIN = "/data/data/com.termux/files/usr/bin";

export function isAndroid(): boolean {
  return fs.existsSync(ANDROID_PICTURES_DIR);
}

export function buildOutputPath(options: {
  prompt: string;
  filename?: string;
  outputDir?: string;
  extension?: string;
}): string {
  const targetDir = options.outputDir
    ? resolveUserPath(options.outputDir)
    : path.join(process.env.HOME || process.cwd(), "media", "images");

  fs.mkdirSync(targetDir, { recursive: true });

  const extension = options.extension || "jpg";
  const stripExt = new RegExp(`\\.(${extension}|jpe?g|png|webp)$`, "i");
  const baseName = options.filename
    ? options.filename.replace(stripExt, "")
    : `${slugify(options.prompt)}-${Date.now()}`;

  return path.join(targetDir, `${baseName}.${extension}`);
}

/**
 * Copies an image into the Android gallery and asks the media scanner to index it.
 * Silently does nothing on non-Android systems or when /sdcard is not readable.
 */
export async function syncToAndroidGallery(
  filePath: string,
  options: { sync?: boolean; open?: boolean } = {}
): Promise<{ galleryPath?: string; openedOnScreen?: boolean }> {
  if (options.sync === false || !isAndroid()) return {};

  const baseName = path.basename(filePath);
  const targetSdcard = path.join(ANDROID_PICTURES_DIR, baseName);

  try {
    fs.copyFileSync(filePath, targetSdcard);
  } catch {
    return {};
  }

  const amPath = path.join(TERMUX_BIN, "am");
  const hasAm = fs.existsSync(amPath);

  if (hasAm) {
    await execAsync(
      `${amPath} broadcast --user 0 -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${targetSdcard}"`
    ).catch(() => {});
  }

  if (options.open) {
    const termuxOpen = path.join(TERMUX_BIN, "termux-open");
    if (fs.existsSync(termuxOpen)) {
      await execAsync(`${termuxOpen} "${targetSdcard}"`).catch(() => {});
      return { galleryPath: targetSdcard, openedOnScreen: true };
    }
    if (hasAm) {
      await execAsync(
        `${amPath} start --user 0 -a android.intent.action.VIEW -d "file://${targetSdcard}" -t "image/*"`
      ).catch(() => {});
      return { galleryPath: targetSdcard, openedOnScreen: true };
    }
  }

  return { galleryPath: targetSdcard };
}

/**
 * Writes raw image bytes to disk and reports size plus Android gallery state.
 * This is the single write path every provider uses.
 */
export async function saveImageBuffer(
  buffer: Buffer,
  options: {
    prompt: string;
    filename?: string;
    outputDir?: string;
    extension?: string;
    syncToGallery?: boolean;
    openInGallery?: boolean;
  }
): Promise<{
  filePath: string;
  fileSizeBytes: number;
  galleryPath?: string;
  openedOnScreen?: boolean;
}> {
  const filePath = buildOutputPath(options);
  fs.writeFileSync(filePath, buffer);

  const { galleryPath, openedOnScreen } = await syncToAndroidGallery(filePath, {
    sync: options.syncToGallery,
    open: options.openInGallery,
  });

  return {
    filePath,
    fileSizeBytes: fs.statSync(filePath).size,
    galleryPath,
    openedOnScreen,
  };
}

/** Downloads a remote image URL into the standard output location. */
export async function saveImageFromUrl(
  url: string,
  options: Parameters<typeof saveImageBuffer>[1]
): Promise<Awaited<ReturnType<typeof saveImageBuffer>>> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image (HTTP ${res.status}) from ${url}`);
  }
  return saveImageBuffer(Buffer.from(await res.arrayBuffer()), options);
}