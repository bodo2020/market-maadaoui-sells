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
    <div dir="rtl" className="rounded-2xl border bg-white p-1.5 shadow-sm">
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-[116px] shrink-0 flex-col justify-center rounded-xl bg-slate-50 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-600">السلات المفتوحة</span>
            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px]">{tabs.length}</Badge>
          </div>
          <div className={cn("mt-0.5 text-[9px]", heldCount > 0 ? "font-semibold text-amber-700" : "text-muted-foreground")}>
            {heldCount > 0 ? `${heldCount} سلة معلقة` : "جاهزة للبيع"}
          </div>
        </div>

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
                "group flex h-14 min-w-[154px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition active:scale-[0.99]",
                isActive ? "border-[#005931]/30 bg-emerald-50 shadow-sm" : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-slate-100"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className={cn("truncate text-xs font-black", isActive ? "text-[#005931]" : "text-foreground")}>{tab.tabName}</div>
                  {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#005931]" />}
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] text-muted-foreground">
                  <span className="shrink-0">{itemCount ? `${itemCount} وحدة` : "فارغة"}</span>
                  {total > 0 && <><span>·</span><span className="truncate font-bold text-foreground">{money(total)}</span></>}
                  {age && <><span>·</span><span className="flex shrink-0 items-center gap-0.5"><Clock3 className="h-2.5 w-2.5" />{age}</span></>}
                </div>
              </div>
              {tabs.length > 1 && (
                <button
                  type="button"
                  aria-label="إغلاق السلة"
                  title={itemCount > 0 ? "إلغاء السلة المعلقة" : "إغلاق السلة"}
                  onClick={event => { event.stopPropagation(); onCloseTab(tab.id); }}
                  className="shrink-0 rounded-lg p-1 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}

        <Button variant="outline" size="sm" onClick={onCreateTab} className="h-14 shrink-0 gap-1 rounded-xl border-dashed px-3 text-xs">
          <Plus className="h-3.5 w-3.5" /> سلة جديدة
        </Button>
      </div>
    </div>
  );
}
