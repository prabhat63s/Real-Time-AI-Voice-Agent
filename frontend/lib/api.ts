export type Role = "user" | "assistant";

export interface ChatMessage {
    role: Role;
    content: string;
}

export interface ChatHistoryItem {
    role: Role;
    content: string;
}

// ---- News metadata types ----
export interface NewsItem {
    title: string;
    source?: string;
    url?: string;
}

export interface NewsMetadata {
    type: "news";
    items: NewsItem[];
}

export interface VoiceChatResponse {
    reply: string;
    language: string;
    news?: NewsItem[]; // <-- backend sends this; UI can turn it into NewsMetadata
}

export interface SttResponse {
    transcript: string;
    language: string; // "hi" or "en"
}

// WebSocket message types
export type WebSocketMessageType =
    | "audio_start"
    | "audio_chunk"
    | "audio_end"
    | "transcript_partial"
    | "transcript_final"
    | "thinking"
    | "status"
    | "error";

export interface WebSocketMessage {
    type: WebSocketMessageType;
    text?: string;
    data?: string; // base64 audio
    message?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function getWebSocketUrl(endpoint: string): string {
    const baseUrl = API_BASE_URL;
    // Replace http with ws, https with wss
    let wsUrl = baseUrl.replace(/^http/, "ws");
    if (!wsUrl.startsWith("ws")) {
        // handle case where baseUrl might be relative or lacking protocol
        if (baseUrl.startsWith("/")) {
            // Browser relative?
            // We can't easily guess host in SSR/helper. 
            // But usually API_BASE_URL is absolute.
            // If relative, we might need window.location logic in hook, not here.
            // Let's assume absolute for now or return as is + endpoint
            return `ws://${window.location.host}${baseUrl}${endpoint}`;
        }
        wsUrl = `ws://${baseUrl}`;
    }

    // Ensure no double slashes
    return `${wsUrl}${endpoint}`;
}



export async function login(username: string, password: string): Promise<boolean> {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
        return true;
    }
    return false;
}

export async function processVoiceInteraction(audioBlob: Blob): Promise<Response> {
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.wav");

    const res = await fetch(`${API_BASE_URL}/api/voice/process`, {
        method: "POST",
        body: formData,
    });

    // If 400 (Bad Request / Silence), return response so caller can handle it
    if (res.status === 400) {
        return res;
    }

    if (!res.ok) {
        throw new Error("Failed to process voice interaction");
    }

    return res;
}

export async function processTextInteraction(text: string): Promise<Response> {
    const res = await fetch(`${API_BASE_URL}/api/voice/process_text`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json", // Important: backend uses Pydantic model
        },
        body: JSON.stringify({ text }),
    });

    if (!res.ok) {
        throw new Error("Failed to process text interaction");
    }

    return res;
}

export async function fetchIntro(): Promise<Response> {
    const res = await fetch(`${API_BASE_URL}/api/voice/intro`, {
        method: "GET",
    });

    if (!res.ok) {
        throw new Error("Failed to get intro audio");
    }

    return res;
}
