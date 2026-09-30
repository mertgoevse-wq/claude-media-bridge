export interface GenerateImageOptions {
    prompt: string;
    filename?: string;
    outputDir?: string;
    aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
    syncToGallery?: boolean;
    openInGallery?: boolean;
}
export interface GeneratedImageResult {
    filePath: string;
    fileSizeBytes: number;
    provider?: string;
    model: string;
    aspectRatio: string;
    revisedPrompt?: string;
    galleryPath?: string;
    openedOnScreen?: boolean;
}
export interface CloudCodeImagePayloadOptions {
    prompt: string;
    projectId: string;
    aspectRatio?: string;
    candidateCount?: number;
}
export interface CloudCodeImagePayload {
    project: string;
    requestId: string;
    request: {
        contents: Array<{
            role: string;
            parts: Array<{
                text: string;
            }>;
        }>;
        generationConfig: {
            candidateCount: number;
            imageConfig: {
                aspectRatio: string;
            };
        };
    };
    model: string;
    userAgent: string;
    requestType: string;
}
export declare function buildCloudCodeImagePayload(options: CloudCodeImagePayloadOptions): CloudCodeImagePayload;
export declare function parseCloudCodeImageResponse(data: unknown, promptText: string): {
    b64_json: string;
    revised_prompt?: string;
};
export declare function generateImageDirect(options: GenerateImageOptions): Promise<GeneratedImageResult>;
