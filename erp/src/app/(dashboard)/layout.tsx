import { AppHeader } from "@/components/layout/app-header";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-12 sm:px-8">{children}</main>
    </div>
  );
}
