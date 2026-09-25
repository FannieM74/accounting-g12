"use client";

import { TOPIC_LABELS, TOPIC_COLORS } from "@/lib/topics";

interface Props {
  topic: string;
}

export default function TopicBadge({ topic }: Props) {
  const label = TOPIC_LABELS[topic] || topic;
  const color = TOPIC_COLORS[topic] || "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
