export interface SpeedtestResult {
  ping: number;
  jitter: number;
  download: number;
  upload: number;
  isp: string;
  serverName: string;
  serverLocation: string;
  resultUrl: string;
}

const BASE_URL = 'https://speed.cloudflare.com';
const REQUEST_TIMEOUT_MS = 20_000;
const DOWNLOAD_BYTES = 25_000_000;
const UPLOAD_BYTES = 5_000_000;

interface CloudflareMeta {
  asOrganization?: string;
  city?: string;
  country?: string;
  colo?: string;
}

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, {
    ...init,
    cache: 'no-store',
    signal: controller.signal
  }).finally(() => clearTimeout(timer));
}

async function measureLatency(samples = 5): Promise<{ ping: number; jitter: number }> {
  const latencies: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    const res = await fetchWithTimeout(`${BASE_URL}/__down?bytes=0`);
    await res.arrayBuffer();
    latencies.push(performance.now() - start);
  }
  const ping = Math.min(...latencies);
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const jitter =
    latencies.reduce((acc, val) => acc + Math.abs(val - mean), 0) / latencies.length;
  return { ping, jitter };
}

async function measureDownload(): Promise<number> {
  const start = performance.now();
  const res = await fetchWithTimeout(`${BASE_URL}/__down?bytes=${DOWNLOAD_BYTES}`);
  const buffer = await res.arrayBuffer();
  const seconds = (performance.now() - start) / 1000;
  return bytesToMbps(buffer.byteLength, seconds);
}

async function measureUpload(): Promise<number> {
  const payload = new Uint8Array(UPLOAD_BYTES);
  const start = performance.now();
  const res = await fetchWithTimeout(`${BASE_URL}/__up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: payload
  });
  await res.arrayBuffer();
  const seconds = (performance.now() - start) / 1000;
  return bytesToMbps(UPLOAD_BYTES, seconds);
}

function bytesToMbps(bytes: number, seconds: number): number {
  if (seconds <= 0) {return 0;}
  return (bytes * 8) / 1_000_000 / seconds;
}

async function fetchMeta(): Promise<CloudflareMeta> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/meta`);
    return (await res.json()) as CloudflareMeta;
  } catch {
    return {};
  }
}

export async function runSpeedtest(): Promise<SpeedtestResult> {
  const [{ ping, jitter }, download, upload, meta] = await Promise.all([
    measureLatency(),
    measureDownload(),
    measureUpload(),
    fetchMeta()
  ]);

  return {
    ping,
    jitter,
    download,
    upload,
    isp: meta.asOrganization || 'Unknown',
    serverName: meta.colo ? `Cloudflare ${meta.colo}` : 'Cloudflare Edge',
    serverLocation: [meta.city, meta.country].filter(Boolean).join(', ') || 'Unknown',
    resultUrl: BASE_URL
  };
}
