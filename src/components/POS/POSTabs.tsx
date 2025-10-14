import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { POSTab } from "@/types";
import { cn } from "@/lib/utils";

interface POSTabsProps {
  tabs: POSTab[];
  activeTabId: string;
  onCreateTab: () => void;
  onCloseTab: (tabId: string) => void;
  onSwitchTab: (tabId: string) => void;
}

export default function POSTabs({
  tabs,
  activeTabId,
  onCreateTab,
  onCloseTab,
  onSwitchTab,
}: POSTabsProps) {
  const getCartItemsCount = (tab: POSTab) => {
    return tab.cartItems.reduce((sum, item) => sum + item.quantity, 0);
  };

  return (
    <div className="flex items-center gap-1 bg-muted/30 p-2 rounded-lg overflow-x-auto">
      {tabs.map((tab) => {
        const itemCount = getCartItemsCount(tab);
        const isActive = tab.id === activeTabId;
        
        return (
          <div
            key={tab.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md transition-all cursor-pointer min-w-fit",
              isActive
                ? "bg-background shadow-sm border border-border"
                : "bg-transparent hover:bg-muted/50"
            )}
            onClick={() => onSwitchTab(tab.id)}
          >
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-sm font-medium",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}>
                {tab.tabName}
              </span>
              {itemCount > 0 && (
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full font-medium",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}>
                  {itemCount}
                </span>
              )}
            </div>
            
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className={cn(
                  "p-0.5 rounded hover:bg-destructive/10 transition-colors",
                  isActive ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground/50"
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
      
      <Button
        variant="ghost"
        size="sm"
        onClick={onCreateTab}
        className="gap-1 min-w-fit"
      >
        <Plus className="h-4 w-4" />
        <span className="text-sm">تبويب جديد</span>
      </Button>
    </div>
  );
}
