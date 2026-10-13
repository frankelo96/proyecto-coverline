import { TreasuryTabs } from "@/components/treasury/treasury-tabs";

export default function TreasuryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Tesorería</h1>
        <TreasuryTabs />
      </div>
      {children}
    </div>
  );
}
