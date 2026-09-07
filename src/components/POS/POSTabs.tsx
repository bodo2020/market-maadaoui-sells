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

function tabItemsCount(tab: POSTab) {
  return tab.cartItems.reduce((sum, item) => sum + (item.weight != null ? 1 : Number(item.quantity || 0)), 0);
}

function tabTotal(tab: POSTab) {
  return tab.cartItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
}

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

export default function POSTabs({ tabs, activeTabId, onCreateTab, onCloseTab, onSwitchTab }: POSTabsProps) {
  return (
    <div dir="rtl" className="rounded-2xl border bg-white p-2 shadow-sm">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        <div className="shrink-0 px-2 text-xs font-semibold text-muted-foreground">السلات المفتوحة</div>
        {tabs.map((tab) => {
          const itemCount = tabItemsCount(tab);
          const total = tabTotal(tab);
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") onSwitchTab(tab.id); }}
              onClick={() => onSwitchTab(tab.id)}
              className={cn(
                "group flex min-w-[150px] shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition",
                isActive ? "border-[#005931]/30 bg-emerald-50 shadow-sm" : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-slate-100"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className={cn("truncate text-sm font-bold", isActive ? "text-[#005931]" : "text-foreground")}>{tab.tabName}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{itemCount ? `${itemCount} صنف/وحدة` : "سلة جديدة"}</span>
                  {total > 0 && <span className="font-semibold text-foreground">{money(total)}</span>}
                </div>
              </div>
              {tabs.length > 1 && (
                <button
                  type="button"
                  aria-label="إغلاق السلة"
                  onClick={event => { event.stopPropagation(); onCloseTab(tab.id); }}
                  className="rounded-lg p-1 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={onCreateTab} className="h-12 shrink-0 gap-1 rounded-xl border-dashed">
          <Plus className="h-4 w-4" /> سلة جديدة
        </Button>
      </div>
    </div>
  );
}
