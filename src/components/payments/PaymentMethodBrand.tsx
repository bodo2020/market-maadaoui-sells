import { Banknote, CreditCard, Landmark, Smartphone, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaymentMethodLogoKey = "auto" | "vodafone_cash" | "instapay" | "bank_cards" | "none";

type BrandablePaymentMethod = {
  code?: string | null;
  name?: string | null;
  method_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const PAYMENT_METHOD_LOGO_OPTIONS: Array<{ value: PaymentMethodLogoKey; label: string }> = [
  { value: "auto", label: "تلقائي حسب الوسيلة" },
  { value: "vodafone_cash", label: "Vodafone Cash" },
  { value: "instapay", label: "InstaPay" },
  { value: "bank_cards", label: "البطاقات البنكية" },
  { value: "none", label: "بدون لوجو" },
];

function explicitLogoKey(method: BrandablePaymentMethod): PaymentMethodLogoKey | null {
  const value = method.metadata?.logo_key;
  if (value === "auto" || value === "vodafone_cash" || value === "instapay" || value === "bank_cards" || value === "none") return value;
  return null;
}

export function resolvePaymentMethodLogoKey(method: BrandablePaymentMethod): PaymentMethodLogoKey {
  const explicit = explicitLogoKey(method);
  if (explicit && explicit !== "auto") return explicit;
  const code = String(method.code || "").toLowerCase();
  const name = String(method.name || "").toLowerCase();
  if (code === "vodafone_cash" || code.includes("vodafone") || name.includes("فودافون") || name.includes("vodafone")) return "vodafone_cash";
  if (code === "instapay" || code.includes("insta_pay") || name.includes("انستا") || name.includes("instapay")) return "instapay";
  if (method.method_type === "card" || code === "card") return "bank_cards";
  return explicit === "none" ? "none" : "auto";
}

export function selectedPaymentMethodLogoKey(method: BrandablePaymentMethod): PaymentMethodLogoKey {
  return explicitLogoKey(method) || "auto";
}

function customLogoUrl(method: BrandablePaymentMethod) {
  const raw = method.metadata?.logo_url;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("/") || value.startsWith("https://")) return value;
  return null;
}

function FallbackIcon({ method }: { method: BrandablePaymentMethod }) {
  if (method.method_type === "cash") return <Banknote className="h-6 w-6" />;
  if (method.method_type === "card") return <CreditCard className="h-6 w-6" />;
  if (method.method_type === "digital_wallet") return <Smartphone className="h-6 w-6" />;
  if (method.method_type === "bank_transfer") return <Landmark className="h-6 w-6" />;
  return <WalletCards className="h-6 w-6" />;
}

function VodafoneCashMark() {
  return (
    <div className="flex items-center gap-1.5" dir="ltr" aria-label="Vodafone Cash">
      <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden="true">
        <circle cx="32" cy="32" r="30" fill="#E60000" />
        <path d="M33.4 15.5c-8.1 1.4-14 8.1-14 16.1 0 9.3 7.2 16.9 16.1 16.9 8.4 0 15-6.4 15-14.4 0-6.6-4.3-11.8-10.3-13.1 2 3.2 2.8 6.1 2.4 8.7-.7 4.2-4.3 7.2-8.6 7.2-4.8 0-8.7-3.7-8.7-8.3 0-5 3.5-9.8 8.1-13.1Z" fill="white" />
      </svg>
      <div className="leading-none">
        <div className="text-[10px] font-black tracking-tight text-[#E60000]">vodafone</div>
        <div className="mt-0.5 text-[11px] font-black text-slate-800">Cash</div>
      </div>
    </div>
  );
}

function InstaPayMark() {
  return (
    <div className="flex items-center gap-1.5" dir="ltr" aria-label="InstaPay">
      <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0 rounded-lg" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#5B2C83" />
        <path d="M12 40 27 21h11L23 40H12Z" fill="#F47C6C" />
        <path d="M27 40 42 21h10L37 40H27Z" fill="#FF6B1A" />
        <path d="M35 46h17l-8-10-9 10Z" fill="#7D5AA6" />
      </svg>
      <div className="text-[11px] font-black tracking-tight text-[#5B2C83]">Insta<span className="text-[#FF6B1A]">Pay</span></div>
    </div>
  );
}

function BankCardsMark() {
  return (
    <div className="flex items-center gap-1" dir="ltr" aria-label="Bank cards">
      <div className="rounded-md border bg-white px-1.5 py-1 text-[9px] font-black italic tracking-tight text-[#1434CB] shadow-sm">VISA</div>
      <div className="relative h-7 w-10 rounded-md border bg-white shadow-sm">
        <span className="absolute left-1.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[#EB001B]" />
        <span className="absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[#F79E1B] opacity-95" />
      </div>
      <div className="rounded-md border bg-white px-1.5 py-1 text-[9px] font-black text-[#007B83] shadow-sm" dir="rtl">ميزة</div>
    </div>
  );
}

export default function PaymentMethodBrand({
  method,
  className,
  compact = false,
}: {
  method: BrandablePaymentMethod;
  className?: string;
  compact?: boolean;
}) {
  const url = customLogoUrl(method);
  const key = resolvePaymentMethodLogoKey(method);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-[#005931] shadow-sm",
        compact ? "h-10 min-w-12 px-2" : "h-12 min-w-16 px-2.5",
        className,
      )}
    >
      {url ? (
        <img src={url} alt={method.name || "وسيلة الدفع"} className="h-full max-h-10 w-auto max-w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
      ) : key === "vodafone_cash" ? (
        <VodafoneCashMark />
      ) : key === "instapay" ? (
        <InstaPayMark />
      ) : key === "bank_cards" ? (
        <BankCardsMark />
      ) : key === "none" ? (
        <span className="text-[10px] text-slate-400">بدون شعار</span>
      ) : (
        <FallbackIcon method={method} />
      )}
    </div>
  );
}
