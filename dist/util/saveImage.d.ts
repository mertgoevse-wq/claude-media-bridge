export declare function isAndroid(): boolean;
export declare function buildOutputPath(options: {
    prompt: string;
    filename?: string;
    outputDir?: string;
    extension?: string;
}): string;
/**
 * Copies an image into the Android gallery and asks the media scanner to index it.
 * Silently does nothing on non-Android systems or when /sdcard is not readable.
 */
export declare function syncToAndroidGallery(filePath: string, options?: {
    sync?: boolean;
    open?: boolean;
}): Promise<{
    galleryPath?: string;
    openedOnScreen?: boolean;
}>;
/**
 * Writes raw image bytes to disk and reports size plus Android gallery state.
 * This is the single write path every provider uses.
 */
export declare function saveImageBuffer(buffer: Buffer, options: {
    prompt: string;
    filename?: string;
    outputDir?: string;
    extension?: string;
    syncToGallery?: boolean;
    openInGallery?: boolean;
}): Promise<{
    filePath: string;
    fileSizeBytes: number;
    galleryPath?: string;
    openedOnScreen?: boolean;
}>;
/** Downloads a remote image URL into the standard output location. */
export declare function saveImageFromUrl(url: string, options: Parameters<typeof saveImageBuffer>[1]): Promise<Awaited<ReturnType<typeof saveImageBuffer>>>;
