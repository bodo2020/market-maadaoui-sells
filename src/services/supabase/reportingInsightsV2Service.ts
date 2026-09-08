import { supabase } from "@/integrations/supabase/client";

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const s = (value: unknown, fallback = "") => value == null ? fallback : String(value);

export type InsightSeverity = "critical" | "warning" | "opportunity" | "info";

export interface ReportingInsightV2 {
  id: string;
  severity: InsightSeverity;
  category: string;
  priority: number;
  title: string;
  message: string;
  metric_label: string;
  metric_value: number;
  metric_unit: string;
  action: string;
  href: string;
  evidence: Record<string, unknown>;
}

export interface ReportingInsightsV2 {
  version: number;
  rule_version: number;
  branch_id: string;
  from: string;
  to: string;
  summary: {
    total: number;
    critical: number;
    warning: number;
    opportunity: number;
    info: number;
    highest_severity: InsightSeverity;
  };
  insights: ReportingInsightV2[];
  data_quality: {
    mode?: string;
    generative_ai_used?: boolean;
    raw_customer_matching_used?: boolean;
    rules_note?: string;
  };
}

const normalizeSeverity = (value: unknown): InsightSeverity => {
  const severity = String(value || "info");
  if (severity === "critical" || severity === "warning" || severity === "opportunity") return severity;
  return "info";
};

export async function fetchReportingInsightsV2(branchId: string, from: Date, to: Date): Promise<ReportingInsightsV2> {
  const { data, error } = await supabase.rpc(
    "get_reporting_insights_v2" as never,
    { p_branch_id: branchId, p_from: from.toISOString(), p_to: to.toISOString() } as never,
  );
  if (error) throw error;
  if (!data) throw new Error("REPORTING_INSIGHTS_EMPTY");

  const raw = data as unknown as Record<string, any>;
  const summary = raw.summary || {};
  return {
    version: n(raw.version) || 2,
    rule_version: n(raw.rule_version) || 1,
    branch_id: s(raw.branch_id, branchId),
    from: s(raw.from, from.toISOString()),
    to: s(raw.to, to.toISOString()),
    summary: {
      total: n(summary.total),
      critical: n(summary.critical),
      warning: n(summary.warning),
      opportunity: n(summary.opportunity),
      info: n(summary.info),
      highest_severity: normalizeSeverity(summary.highest_severity),
    },
    insights: (raw.insights || []).map((row: Record<string, unknown>) => ({
      id: s(row.id),
      severity: normalizeSeverity(row.severity),
      category: s(row.category, "general"),
      priority: n(row.priority),
      title: s(row.title, "إشارة تشغيلية"),
      message: s(row.message),
      metric_label: s(row.metric_label, "المؤشر"),
      metric_value: n(row.metric_value),
      metric_unit: s(row.metric_unit),
      action: s(row.action),
      href: s(row.href, "/reports"),
      evidence: (row.evidence && typeof row.evidence === "object" ? row.evidence : {}) as Record<string, unknown>,
    })),
    data_quality: raw.data_quality || {},
  };
}
