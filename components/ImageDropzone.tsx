"use client";

import { useRef } from "react";
import { fileToCompressedDataUrl } from "@/lib/imageUtils";

export default function ImageDropzone({
  images,
  onChange,
  max = 3,
  label = "Add photos",
}: {
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const remaining = max - images.length;
    const selected = Array.from(files).slice(0, Math.max(0, remaining));
    const encoded = await Promise.all(selected.map((f) => fileToCompressedDataUrl(f)));
    onChange([...images, ...encoded]);
  }

  function removeAt(idx: number) {
    onChange(images.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((src, idx) => (
          <div key={idx} className="relative h-24 w-24 rounded-lg overflow-hidden border border-neutral-700">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URLs, next/image can't optimize these */}
            <img src={src} alt={`upload-${idx}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="absolute top-1 right-1 rounded-full bg-black/70 text-white text-xs w-5 h-5 flex items-center justify-center"
              aria-label="Remove photo"
            >
              ×
            </button>
          </div>
        ))}

        {images.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-24 w-24 rounded-lg border border-dashed border-neutral-600 text-neutral-400 text-xs flex flex-col items-center justify-center gap-1 hover:border-neutral-400 hover:text-neutral-200 transition"
          >
            <span className="text-xl leading-none">+</span>
            <span>{label}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
