
import React from "react";
import SidebarItem from "./SidebarItem";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types";
import { sidebarNavigation } from "./sidebarNavigation";

export const SidebarContent = () => {
  const { user } = useAuth();
  
  // Filter navigation items based on user role if needed
  const items = sidebarNavigation;

  return (
    <div className="space-y-2 py-4">
      {items.map((item) => (
        <SidebarItem
          key={item.href}
          title={item.title}
          href={item.href}
          icon={item.icon}
          disabled={item.disabled}
          label={item.label}
        />
      ))}
    </div>
  );
};

export default SidebarContent;
