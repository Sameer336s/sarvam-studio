/**
 * Talk mode: speech in, speech out.
 *
 * Two paths on purpose, because a WebView and a desktop browser are different animals:
 *
 *  - Speech to text: Sarvam's Saaras endpoint when a Sarvam key is configured (works
 *    everywhere, 22 Indian languages, 30 s per request), otherwise the browser's own
 *    Web Speech API when it exists.
 *  - Text to speech: the platform's `speechSynthesis`, which uses the phone's installed
 *    voices and needs no key at all.
 */

const STT_URL = "https://api.sarvam.ai/speech-to-text";

/* ------------------------------------------------------------------ support */

export type SttEngine = "sarvam" | "browser" | "none";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function RecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = globalThis as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttEngine(hasSarvamKey: boolean): SttEngine {
  if (hasSarvamKey) return "sarvam";
  if (RecognitionCtor()) return "browser";
  return "none";
}

export function ttsAvailable(): boolean {
  return typeof globalThis.speechSynthesis !== "undefined";
}

/* --------------------------------------------------------------- recording */

export type Recorder = {
  /** Resolves with the recorded audio when stopped. */
  stop: () => Promise<Blob>;
  cancel: () => void;
  /** Milliseconds elapsed so far. */
  elapsed: () => number;
};

export async function startRecording(maxMs = 30000): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser cannot record audio.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  const mime = candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";

  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  const started = Date.now();

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(200);

  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());

  // Hard stop so a forgotten recording does not eat the mic.
  const timer = setTimeout(() => {
    if (recorder.state !== "inactive") recorder.stop();
  }, maxMs);

  return {
    elapsed: () => Date.now() - started,
    cancel: () => {
      clearTimeout(timer);
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        /* ignore */
      }
      stopTracks();
    },
    stop: () =>
      new Promise<Blob>((resolve) => {
        clearTimeout(timer);
        const finish = () => {
          stopTracks();
          resolve(new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" }));
        };
        if (recorder.state === "inactive") finish();
        else {
          recorder.onstop = finish;
          recorder.stop();
        }
      }),
  };
}

/* ------------------------------------------------------------------- stt */

export async function transcribeSarvam(
  audio: Blob,
  apiKey: string,
  language = "unknown",
): Promise<{ text: string; language: string }> {
  const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("file", audio, `speech.${ext}`);
  form.append("model", "saaras:v4");
  form.append("mode", "transcribe");
  form.append("language_code", language || "unknown");

  const res = await fetch(STT_URL, {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Sarvam key rejected for speech-to-text."
        : `Speech-to-text failed (${res.status}). ${body.slice(0, 140)}`,
    );
  }
  const json: any = await res.json();
  return { text: (json.transcript ?? "").trim(), language: json.language_code ?? language };
}

/** Live transcription with the browser engine. Resolves when the user stops. */
export function transcribeBrowser(language = "en-IN"): Promise<string> {
  const Ctor = RecognitionCtor();
  if (!Ctor) return Promise.reject(new Error("Speech recognition is not available here."));

  return new Promise((resolve, reject) => {
    const rec = new Ctor();
    rec.lang = language === "unknown" ? "en-IN" : language;
    rec.continuous = false;
    rec.interimResults = false;
    let text = "";
    rec.onresult = (e: any) => {
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0]?.transcript ?? "";
      }
    };
    rec.onerror = (e: any) => reject(new Error(e?.error === "not-allowed" ? "Microphone permission denied." : "Speech recognition failed."));
    rec.onend = () => resolve(text.trim());
    try {
      rec.start();
    } catch {
      reject(new Error("Could not start speech recognition."));
    }
  });
}

/* ------------------------------------------------------------------- tts */

/** Best-effort BCP-47 language from the script the text is written in. */
export function detectLang(text: string): string {
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  if (/[\u0980-\u09FF]/.test(text)) return "bn-IN";
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu-IN";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te-IN";
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn-IN";
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml-IN";
  if (/[\u0A00-\u0A7F]/.test(text)) return "pa-IN";
  if (/[\u0B00-\u0B7F]/.test(text)) return "or-IN";
  if (/[\u0600-\u06FF]/.test(text)) return "ur-IN";
  return "en-IN";
}

/** Strips markdown so the voice does not read asterisks and backticks out loud. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " (code block) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function stopSpeaking() {
  if (ttsAvailable()) globalThis.speechSynthesis.cancel();
}

export function speak(text: string, opts: { rate?: number; lang?: string } = {}): boolean {
  if (!ttsAvailable()) return false;
  const clean = speakable(text);
  if (!clean) return false;

  const synth = globalThis.speechSynthesis;
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(clean.slice(0, 4000));
  const lang = opts.lang || detectLang(text);
  utter.lang = lang;
  utter.rate = Math.min(2, Math.max(0.5, opts.rate ?? 1));

  const voices = synth.getVoices();
  const exact = voices.find((v) => v.lang === lang);
  const prefix = voices.find((v) => v.lang?.startsWith(lang.split("-")[0]));
  if (exact || prefix) utter.voice = (exact ?? prefix)!;

  synth.speak(utter);
  return true;
}

export function listVoices(): { name: string; lang: string }[] {
  if (!ttsAvailable()) return [];
  return globalThis.speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang }));
}
