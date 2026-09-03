"use client";

import Sidebar from "@/components/Sidebar";
import Bar from "@/components/Bar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
      
      {/* Global Sidebar */}
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden pb-16 sm:pb-0">
        <Bar />

        <div className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-white/10">
          {children}
        </div>
      </main>
    </div>
  );
}
