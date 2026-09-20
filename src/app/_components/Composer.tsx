"use client";

import { useEffect, useRef } from "react";

export type Attachment = {
  id: string;
  file: File;
  /** Object URL for the thumbnail. Revoked when the chip is removed. */
  url: string;
};

export type Pointer = {
  controlId: string | null;
  role: string | null;
  label: string;
  elementSnippet: string;
};

const CLASS_OPTIONS = [8, 9, 10];

/**
 * The only input surface. Pinned to the bottom, the way every chat product
 * works, because the teacher's whole interaction is a conversation about the
 * material rather than a form they fill once.
 *
 * Class and language live here rather than in a separate form: they are
 * properties of the session, and they have nowhere else to be now that the
 * form is gone.
 */
export function Composer({
  text,
  onTextChange,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  pointer,
  onClearPointer,
  classNumber,
  onClassChange,
  language,
  onLanguageChange,
  onSend,
  busy,
  started,
}: {
  text: string;
  onTextChange: (value: string) => void;
  attachments: Attachment[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  pointer: Pointer | null;
  onClearPointer: () => void;
  classNumber: number;
  onClassChange: (value: number) => void;
  language: "ml" | "en";
  onLanguageChange: (value: "ml" | "en") => void;
  onSend: () => void;
  busy: boolean;
  started: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content instead of scrolling a three-line box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const canSend = !busy && text.trim().length >= 2;

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <div className="border-t border-[var(--frame)] bg-[var(--stone)] px-4 py-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {pointer && (
          <div className="flex w-fit items-center gap-2 rounded-full border border-[var(--chalk-rose)] px-3 py-1 text-sm text-[var(--chalk)]">
            <span className="text-[var(--chalk-dim)]">about</span>
            <span>{pointer.label || pointer.controlId || pointer.role || "this part"}</span>
            <button
              type="button"
              onClick={onClearPointer}
              aria-label="Stop pointing at this element"
              className="text-[var(--chalk-dim)] hover:text-[var(--chalk)]"
            >
              ×
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="relative h-16 w-16 overflow-hidden rounded-md border border-[var(--frame)]"
              >
                {/* Local object URL for a file the teacher just picked; next/image
                    would add nothing here and cannot optimise a blob. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.url}
                  alt={attachment.file.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  aria-label={`Remove ${attachment.file.name}`}
                  className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-md bg-[var(--stone-deep)] text-xs text-[var(--chalk)] hover:bg-[var(--chalk-rose)] hover:text-[var(--stone-deep)]"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2 rounded-lg border border-[var(--frame)] bg-[var(--stone-deep)] p-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Add a photo"
            className="min-h-[44px] min-w-[44px] rounded-md text-xl text-[var(--chalk-dim)] hover:bg-[var(--stone)] hover:text-[var(--chalk)]"
          >
            +
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              onAddFiles(event.target.files);
              // Reset so picking the same file twice still fires a change.
              event.target.value = "";
            }}
          />

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              started
                ? "What should change?"
                : "എന്റെ ക്ലാസ്സിന് പാരലൽ സർക്യൂട്ടിൽ current എങ്ങനെ വീതിക്കപ്പെടുന്നു എന്ന് മനസിലാകുന്നില്ല…"
            }
            className="max-h-[200px] flex-1 resize-none bg-transparent py-2 text-[var(--chalk)] placeholder:text-[var(--chalk-dim)] focus:outline-none"
          />

          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
            className="min-h-[44px] min-w-[44px] rounded-md bg-[var(--frame)] font-bold text-[var(--stone-deep)] disabled:opacity-40"
          >
            ↑
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={classNumber}
            onChange={(event) => onClassChange(Number(event.target.value))}
            disabled={started}
            aria-label="Class"
            className="min-h-[36px] rounded-md border border-[var(--frame)] bg-[var(--stone-deep)] px-2 text-[var(--chalk)] disabled:opacity-50"
          >
            {CLASS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                class {option}
              </option>
            ))}
          </select>

          <select
            value={language}
            onChange={(event) => onLanguageChange(event.target.value as "ml" | "en")}
            disabled={started}
            aria-label="Language"
            className="min-h-[36px] rounded-md border border-[var(--frame)] bg-[var(--stone-deep)] px-2 text-[var(--chalk)] disabled:opacity-50"
          >
            <option value="ml">ml</option>
            <option value="en">en</option>
          </select>

          <span className="text-[var(--chalk-dim)]">
            {started ? "Class and language are set for this session." : "Enter to send, Shift+Enter for a new line."}
          </span>
        </div>
      </div>
    </div>
  );
}
