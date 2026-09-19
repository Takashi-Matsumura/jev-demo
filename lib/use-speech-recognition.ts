"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Web Speech API の最小ラッパー。
 * lib.dom には SpeechRecognitionResult 系しか宣言がないので、
 * 使う部分だけ自前で型をつける。
 */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: SpeechRecognitionResultList;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** 対応状況は変化しないので、購読は何もしない。 */
function subscribeNever(): () => void {
  return () => {};
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "マイクの使用が許可されていません",
  "service-not-allowed": "マイクの使用が許可されていません",
  "audio-capture": "マイクが見つかりません",
  "no-speech": "音声を検出できませんでした",
  network: "音声認識サーバに接続できませんでした",
  aborted: "",
};

export type SpeechRecognitionState = {
  /** このブラウザで音声入力が使えるか（マウント後に確定する） */
  supported: boolean;
  listening: boolean;
  /** 確定前の認識結果 */
  interim: string;
  error: string | null;
  toggle: () => void;
};

export function useSpeechRecognition({
  lang = "ja-JP",
  onFinal,
}: {
  lang?: string;
  /** 発話が確定したときに 1 回だけ呼ばれる */
  onFinal: (transcript: string) => void;
}): SpeechRecognitionState {
  // SSR では false、マウント後にブラウザの対応状況が確定する
  const supported = useSyncExternalStore(
    subscribeNever,
    () => getConstructor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // ハンドラの差し替えで認識インスタンスを作り直さないよう ref に逃がす
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  useEffect(() => {
    const Constructor = getConstructor();
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let draft = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          setInterim("");
          onFinalRef.current(transcript.trim());
          return;
        }
        draft += transcript;
      }
      setInterim(draft);
    };

    recognition.onerror = (event) => {
      const message = ERROR_MESSAGES[event.error] ?? `認識エラー (${event.error})`;
      setError(message || null);
      setListening(false);
      setInterim("");
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [lang]);

  const toggle = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (listening) {
      recognition.stop();
      return;
    }

    setError(null);
    setInterim("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      // すでに開始済みのときに InvalidStateError が飛ぶ
      setListening(false);
    }
  }, [listening]);

  return { supported, listening, interim, error, toggle };
}
