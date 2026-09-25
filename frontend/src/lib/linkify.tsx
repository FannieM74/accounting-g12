import { Fragment } from "react";

export function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("http://") || part.startsWith("https://")) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800 break-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded" aria-label={`${part} - opens in new tab`}>{part}</a>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
