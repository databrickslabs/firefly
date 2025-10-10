import { MarketingNav } from "@/components/marketing-nav";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen h-screen flex flex-col overflow-hidden">
      <MarketingNav />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
