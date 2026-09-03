"use client";

import Bar from "../../components/Bar";
import BentoHome from "../../components/BentoHome";

export default function HomePage() {
  return (
    <div className="flex min-h-screen">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Bar />

        <div className="flex-1 overflow-y-auto relative z-10 scrollbar-thin scrollbar-thumb-white/10">
          <BentoHome />
        </div>
      </main>
    </div>
  );
}
