import { Clock3, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function tabAge(createdAt: POSTab["createdAt"]) {
  const date = createdAt ? new Date(createdAt) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  return `${hours} س`;
}

export default function POSTabs({ tabs, activeTabId, onCreateTab, onCloseTab, onSwitchTab }: POSTabsProps) {
  const heldCount = tabs.filter(tab => tab.id !== activeTabId && tab.cartItems.length > 0).length;

  return (
    <div dir="rtl" className="rounded-2xl border bg-white p-2 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">السلات المفتوحة</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{tabs.length}</Badge>
        </div>
        {heldCount > 0 && <span className="text-[11px] text-amber-700">{heldCount} سلة معلقة</span>}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {tabs.map((tab) => {
          const itemCount = tabItemsCount(tab);
          const total = tabTotal(tab);
          const isActive = tab.id === activeTabId;
          const age = tabAge(tab.createdAt);
          return (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") onSwitchTab(tab.id); }}
              onClick={() => onSwitchTab(tab.id)}
              className={cn(
                "group flex min-w-[170px] shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition active:scale-[0.99]",
                isActive ? "border-[#005931]/30 bg-emerald-50 shadow-sm" : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-slate-100"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className={cn("truncate text-sm font-bold", isActive ? "text-[#005931]" : "text-foreground")}>{tab.tabName}</div>
                  {isActive && <span className="h-2 w-2 shrink-0 rounded-full bg-[#005931]" />}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{itemCount ? `${itemCount} وحدة` : "فارغة"}</span>
                  {total > 0 && <span className="font-bold text-foreground">{money(total)}</span>}
                </div>
                {age && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                    <Clock3 className="h-3 w-3" /> {age}
                    {!isActive && itemCount > 0 && <span className="text-amber-700">· معلقة</span>}
                  </div>
                )}
              </div>
              {tabs.length > 1 && (
                <button
                  type="button"
                  aria-label="إغلاق السلة"
                  title={itemCount > 0 ? "إلغاء السلة المعلقة" : "إغلاق السلة"}
                  onClick={event => { event.stopPropagation(); onCloseTab(tab.id); }}
                  className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={onCreateTab} className="h-14 shrink-0 gap-1 rounded-xl border-dashed px-4">
          <Plus className="h-4 w-4" /> سلة جديدة
        </Button>
      </div>
    </div>
  );
}
