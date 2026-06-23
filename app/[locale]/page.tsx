"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import TaskWizard from "@/components/TaskWizard";
import Marketplace from "@/components/Marketplace";
import Bar from "@/components/Bar";

export default function HomePage() {
  const [activeSection, setActiveSection] = useState("automation");

  const handleUseModule = (module: any) => {
    setActiveSection("automation");
    // State pass could be added here for TaskWizard
  };

  return (
    <div className="flex min-h-screen">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
      
      {/* Sidebar is now hidden */}
      {/* <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} /> */}
      
      <main className="flex-1 flex flex-col min-w-0">
        <Bar />

        <div className="flex-1 overflow-y-auto">
          {activeSection === "dashboard" && <Dashboard setActiveSection={setActiveSection} />}
          {activeSection === "automation" && <TaskWizard />}
          {activeSection === "marketplace" && <Marketplace onUseModule={handleUseModule} />}
          {activeSection === "tasks" && (
            <div className="p-6 text-center text-gray-400 mt-20">
              <h2 className="text-2xl font-bold mb-2">My Tasks</h2>
              <p>No tasks found.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
