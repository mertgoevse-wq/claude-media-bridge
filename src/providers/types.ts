export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface ProviderImageOptions {
  prompt: string;
  provider?: string;
  model?: string;
  aspectRatio?: AspectRatio;
  filename?: string;
  outputDir?: string;
  syncToGallery?: boolean;
  openInGallery?: boolean;
  apiKey?: string;
}

export interface GeneratedImageResult {
  filePath: string;
  fileSizeBytes: number;
  provider: string;
  model: string;
  aspectRatio: string;
  revisedPrompt?: string;
  galleryPath?: string;
  openedOnScreen?: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  defaultModel: string;
  supportedModels: string[];
  requiresApiKey: boolean;
  isConfigured: boolean;
}

export interface MediaProvider {
  id: string;
  name: string;
  description: string;
  defaultModel: string;
  supportedModels: string[];
  requiresApiKey: boolean;
  isConfigured(): boolean;
  generateImage(options: ProviderImageOptions): Promise<GeneratedImageResult>;
}
