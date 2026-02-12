import React, { useEffect, useMemo, useState } from "react";

type Props = {
  label: string;
  gifName?: string;
};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function HeaderGif({ label, gifName }: Props) {
  const gifSrc = useMemo(() => {
    if (gifName && gifName.trim().length > 0) {
      return `/gifs/${gifName}.gif`;
    }
    return `/gifs/${toSlug(label)}.gif`;
  }, [label, gifName]);
  const [src, setSrc] = useState(gifSrc);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    setFallback(false);
    setSrc(gifSrc);
  }, [gifSrc]);

  return (
    <div className="header-gif">
      <img
        src={src}
        alt={`${label} gif`}
        loading="eager"
        onError={() => {
          if (!fallback) {
            setFallback(true);
            setSrc("/icon.svg");
          }
        }}
      />
    </div>
  );
}
