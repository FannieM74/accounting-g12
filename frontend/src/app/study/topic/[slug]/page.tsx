import StudyTopicClient from "./client";

export function generateStaticParams() {
  return [
    { slug: "stock-valuation" },
    { slug: "fixed-assets" },
    { slug: "income-statement" },
    { slug: "financial-position" },
    { slug: "cash-flow" },
    { slug: "financial-indicators" },
    { slug: "interpretation" },
    { slug: "shareholding" },
    { slug: "governance" },
  ];
}

export default async function StudyTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StudyTopicClient slug={slug} />;
}
