"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Link2, Mic, Paperclip } from "lucide-react";
import type { Change } from "@/lib/tools/clean_input";
import { cn } from "@/lib/utils";

/**
 * The input box, built for dictation first.
 *
 * Dictation tools type into whatever is focused, so the requirements are unglamorous:
 * a large autofocused textarea that grows, Ctrl/Cmd+Enter to send, and no interference
 * with the keystrokes arriving. The browser mic button is a fallback for when no
 * dictation app is running, not the primary path.
 *
 * The raw-vs-cleaned diff is shown *before* sending, because the app is rewriting what
 * the user said and they should see what changed.
 */

export type InputMode = { text: boolean; dictation: boolean; file: boolean; url: boolean };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

export function SmartInput({
  modes,
  acceptedFileTypes,
  sampleQuestions,
  busy,
  onSubmit,
  onFile,
  onUrl,
  cleaned,
  className,
}: {
  modes: InputMode;
  acceptedFileTypes: string[];
  sampleQuestions: string[];
  busy: boolean;
  onSubmit: (text: string) => void;
  onFile?: (file: File) => void;
  onUrl?: (url: string) => void;
  /** Set after an ingest returns a diff, so the user sees what was changed. */
  cleaned?: { raw: string; cleaned: string; changes: Change[] } | null;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [showUrl, setShowUrl] = useState(false);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  // Grow with content rather than scrolling: dictated input is often several sentences,
  // and a 3-line box that scrolls hides what was just said.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
    setValue("");
  };

  const toggleMic = () => {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) transcript += event.results[i][0].transcript;
      setValue(transcript);
    };
    rec.onend = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  };

  const micAvailable =
    modes.dictation &&
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label="Input">
      {sampleQuestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sampleQuestions.map((question) => (
            <button
              key={question}
              type="button"
              disabled={busy}
              onClick={() => {
                setValue(question);
                textarea.current?.focus();
              }}
              className="rounded-pill border border-line bg-glass px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink-1 disabled:opacity-50"
            >
              {question}
            </button>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => {
          if (!modes.file) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!modes.file) return;
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && onFile) onFile(file);
        }}
        className={cn(
          "rounded-panel border bg-surface-1 transition-colors",
          dragging ? "border-violet-line bg-violet-haze" : "border-line",
        )}
      >
        <label htmlFor="smart-input" className="sr-only">
          Ask the agent
        </label>
        <textarea
          id="smart-input"
          ref={textarea}
          value={value}
          autoFocus
          rows={3}
          disabled={busy}
          placeholder={
            modes.file
              ? "Type, dictate, or drop a file… (Ctrl+Enter to send)"
              : "Type or dictate… (Ctrl+Enter to send)"
          }
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          className="w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed text-ink-1 outline-none placeholder:text-ink-4 disabled:opacity-60"
        />

        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
          {micAvailable && (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={listening}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[12px] transition-colors",
                listening
                  ? "border-coral-line bg-coral-soft text-coral"
                  : "border-line bg-glass text-ink-2 hover:text-ink-1",
              )}
            >
              <Mic className="size-3" />
              {listening ? "listening…" : "mic"}
            </button>
          )}

          {modes.file && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-pill border border-line bg-glass px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:text-ink-1">
              <Paperclip className="size-3" />
              file
              <input
                type="file"
                className="sr-only"
                accept={acceptedFileTypes.join(",")}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && onFile) onFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}

          {modes.url && (
            <button
              type="button"
              onClick={() => setShowUrl((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-glass px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:text-ink-1"
            >
              <Link2 className="size-3" />
              url
            </button>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={busy || !value.trim()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-pill border border-brand-line bg-brand px-3 py-1 text-[12px] font-medium text-brand-foreground transition-opacity disabled:opacity-40"
          >
            {busy ? "working…" : "Send"}
            <ArrowUp className="size-3" />
          </button>
        </div>

        {showUrl && modes.url && (
          <div className="flex gap-2 border-t border-line px-3 py-2.5">
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://…"
              aria-label="URL to ingest"
              className="min-w-0 flex-1 rounded-chip border border-line bg-ink px-2.5 py-1.5 text-[13px] text-ink-1 outline-none focus-visible:border-violet-line"
            />
            <button
              type="button"
              disabled={!urlDraft.trim()}
              onClick={() => {
                if (onUrl) onUrl(urlDraft.trim());
                setUrlDraft("");
                setShowUrl(false);
              }}
              className="rounded-pill border border-line-strong bg-glass-strong px-3 py-1.5 text-[12px] text-ink-1 disabled:opacity-40"
            >
              Fetch
            </button>
          </div>
        )}
      </div>

      {cleaned && cleaned.changes.length > 0 && (
        <div className="rounded-panel border border-violet-line bg-violet-haze p-3">
          <h3 className="label-caps mb-2 text-ink-3">Raw vs cleaned</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] text-ink-4">as received</p>
              <p className="rounded-card border border-line bg-ink p-2 font-mono text-[11px] leading-relaxed text-ink-3">
                {cleaned.raw}
              </p>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-ink-4">as used</p>
              <p className="rounded-card border border-violet-line bg-ink p-2 font-mono text-[11px] leading-relaxed text-ink-1">
                {cleaned.cleaned}
              </p>
            </div>
          </div>
          <ul className="mt-2 flex list-none flex-col gap-1">
            {cleaned.changes.map((change, i) => (
              <li key={i} className="text-[11px] text-ink-3">
                <span className="label-caps mr-1.5 text-violet">{change.kind}</span>
                {change.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
