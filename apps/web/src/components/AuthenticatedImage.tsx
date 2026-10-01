"use client";

import { ImgHTMLAttributes, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type AuthenticatedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

/** Render an image served by an authenticated workspace endpoint. */
export default function AuthenticatedImage({ src, alt, ...props }: AuthenticatedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let currentUrl: string | null = null;

    apiFetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`Image request failed with status ${response.status}.`);
        return response.blob();
      })
      .then((blob) => {
        if (disposed) return;
        currentUrl = window.URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
      })
      .catch(() => {
        if (!disposed) setObjectUrl(null);
      });

    return () => {
      disposed = true;
      if (currentUrl) window.URL.revokeObjectURL(currentUrl);
    };
  }, [src]);

  if (!objectUrl) return <span role="status" aria-label={`Loading ${alt ?? "image"}`} />;
  return <img src={objectUrl} alt={alt ?? ""} {...props} />;
}
