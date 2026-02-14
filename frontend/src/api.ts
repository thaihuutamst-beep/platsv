import axios, { AxiosError } from "axios";
import { toast } from "./utils/toast";

export const API_URL = `http://${window.location.hostname}:8000`;

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

// --- Retry interceptor with exponential backoff ---
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as any;
    if (!config) return Promise.reject(error);

    config.__retryCount = config.__retryCount || 0;

    // Only retry on network errors or 5xx server errors
    const isRetryable =
      !error.response || (error.response.status >= 500 && error.response.status < 600);

    if (isRetryable && config.__retryCount < MAX_RETRIES) {
      config.__retryCount += 1;
      const delay = RETRY_DELAY_MS * Math.pow(2, config.__retryCount - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return api(config);
    }

    // Show toast for user-facing errors
    if (!error.response) {
      toast.error("Không thể kết nối server. Kiểm tra kết nối mạng.");
    } else if (error.response.status >= 500) {
      toast.error(`Lỗi server (${error.response.status}). Vui lòng thử lại.`);
    } else if (error.response.status === 401) {
      toast.warning("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
    } else if (error.response.status === 404) {
      // Don't toast for 404 — often expected (e.g. no progress saved)
    } else if (error.response.status >= 400) {
      const detail = (error.response.data as any)?.detail;
      toast.error(detail || `Lỗi: ${error.response.status}`);
    }

    return Promise.reject(error);
  }
);

export type Tag = { id: number; name: string };

export type MediaItem = {
  id: number;
  path: string;
  name: string;
  size: number;
  rating: number;
  created_at: string | null;
  updated_at: string | null;
  tags: Tag[];
  thumbnail?: string | null;
  width?: number | null;
  height?: number | null;
  mime_type?: string | null;
  duration?: number | null;
};

export type FetchFilesResponse = {
  items: MediaItem[];
  total: number;
};

export interface FetchFilesParams {
  offset?: number;
  limit?: number;
  sort_by?: string;
  order?: string;
  q?: string;
  media_type?: string;
  min_size?: number;
  max_size?: number;
  min_duration?: number;
  max_duration?: number;
  exclude_images?: boolean;
  exclude_videos?: boolean;
  // New filters
  cloud_provider?: string;
  path?: string;
  exact_path?: boolean;
}

export async function fetchFiles(params: FetchFilesParams = {}): Promise<FetchFilesResponse> {
  const { offset = 0, limit = 60, ...filters } = params;
  const res = await api.get<FetchFilesResponse>("/files", {
    params: { offset, limit, ...filters }
  });
  return res.data;
}

export type BrowseResponse = {
  current_path: string;
  folders: string[];
  files: MediaItem[];
  breadcrumbs: string[];
}

export async function browseFolder(path?: string, cloud_provider?: string): Promise<BrowseResponse> {
  const res = await api.get<BrowseResponse>("/browse", {
    params: { path, cloud_provider }
  });
  return res.data;
}

export async function triggerScan() {
  const res = await api.post("/scan");
  return res.data;
}

export async function controlPause() {
  return (await api.post("/control/pause")).data;
}

export async function controlNext() {
  return (await api.post("/control/next")).data;
}

export async function controlPrev() {
  return (await api.post("/control/prev")).data;
}

export async function controlSeek(seconds: number) {
  return (await api.post("/control/seek", { seconds })).data;
}

export async function controlVolume(level: number) {
  return (await api.post("/control/volume", { level })).data;
}

// Progress tracking
export type PlayProgress = {
  position: number;
  finished: boolean;
  played_at?: string;
};

export async function saveProgress(mediaId: number, position: number, finished: boolean = false) {
  return (await api.post(`/progress/${mediaId}`, { position, finished })).data;
}

export async function getProgress(mediaId: number): Promise<PlayProgress> {
  return (await api.get(`/progress/${mediaId}`)).data;
}

export async function play(mediaId: number, start: boolean = true) {
  // Matches usage in FileList.tsx
  return (await api.post("/play", null, {
    params: {
      media_id: mediaId,
      mpv: true,
      start: start
    }
  })).data;
}

export async function castFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return (await api.post("/cast", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  })).data;
}

export async function downloadVideo(url: string, cookiesFile?: File, uploadToTelegram: boolean = true) {
  const formData = new FormData();
  formData.append("url", url);
  formData.append("upload_to_telegram", String(uploadToTelegram));

  if (cookiesFile) {
    formData.append("cookies_file", cookiesFile);
  }

  return (await axios.post(`${API_URL}/ytdlp/download`, formData)).data;
}

export async function castMedia(file: File, mode: "play" | "queue" = "play") {
  const formData = new FormData();
  formData.append("file", file);
  return (await axios.post(`${API_URL}/cast?mode=${mode}`, formData)).data;
}

export async function castUrl(url: string, mode: "play" | "queue" = "play") {
  return (await axios.post(`${API_URL}/cast/url`, { url, mode })).data;
}
