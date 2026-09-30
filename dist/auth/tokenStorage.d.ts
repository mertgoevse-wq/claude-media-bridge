export interface StoredCredentials {
    accessToken: string;
    refreshToken?: string;
    expiryDate?: number;
    projectId?: string;
    email?: string;
}
export declare function setCredentialsDirectoryForTesting(dir: string | null): void;
export declare function getCredentialsDir(): string;
export declare function getCredentialsPath(): string;
export declare function loadStoredCredentials(): StoredCredentials | null;
export declare function saveStoredCredentials(creds: StoredCredentials): void;
export declare function clearStoredCredentials(): void;
export declare function isTokenExpired(expiryDate?: number, bufferMs?: number): boolean;
