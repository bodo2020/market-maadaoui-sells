import { supabase } from "@/integrations/supabase/client";
import { fetchInventoryTransferSmartAlertsV2 } from "@/services/supabase/inventoryTransferSmartAlertsV2Service";

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
    transfer_alert_rules?: Record<string, unknown>;
  };
}

const normalizeSeverity = (value: unknown): InsightSeverity => {
  const severity = String(value || "info");
  if (severity === "critical" || severity === "warning" || severity === "opportunity") return severity;
  return "info";
};

const severityRank: Record<InsightSeverity, number> = {
  critical: 4,
  warning: 3,
  opportunity: 2,
  info: 1,
};

const summarizeInsights = (insights: ReportingInsightV2[]) => {
  const summary = {
    total: insights.length,
    critical: 0,
    warning: 0,
    opportunity: 0,
    info: 0,
    highest_severity: "info" as InsightSeverity,
  };
  for (const insight of insights) {
    summary[insight.severity] += 1;
    if (severityRank[insight.severity] > severityRank[summary.highest_severity]) {
      summary.highest_severity = insight.severity;
    }
  }
  return summary;
};

export async function fetchReportingInsightsV2(branchId: string, from: Date, to: Date): Promise<ReportingInsightsV2> {
  const [baseResult, transferAlerts] = await Promise.all([
    supabase.rpc(
      "get_reporting_insights_v2" as any,
      { p_branch_id: branchId, p_from: from.toISOString(), p_to: to.toISOString() } as any,
    ),
    fetchInventoryTransferSmartAlertsV2(branchId, from, to),
  ]);

  if (baseResult.error) throw baseResult.error;
  if (!baseResult.data) throw new Error("REPORTING_INSIGHTS_EMPTY");

  const raw = baseResult.data as unknown as Record<string, any>;
  const baseInsights: ReportingInsightV2[] = (raw.insights || []).map((row: Record<string, unknown>) => ({
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
  }));

  const mergedById = new Map<string, ReportingInsightV2>();
  for (const insight of baseInsights) mergedById.set(insight.id, insight);
  for (const alert of transferAlerts.alerts) {
    mergedById.set(alert.id, {
      id: alert.id,
      severity: alert.severity,
      category: alert.category,
      priority: alert.priority,
      title: alert.title,
      message: alert.message,
      metric_label: alert.metric_label,
      metric_value: alert.metric_value,
      metric_unit: alert.metric_unit,
      action: alert.action,
      href: alert.href,
      evidence: alert.evidence,
    });
  }

  const insights = Array.from(mergedById.values()).sort((a, b) =>
    b.priority - a.priority || severityRank[b.severity] - severityRank[a.severity] || a.id.localeCompare(b.id),
  );

  return {
    version: n(raw.version) || 2,
    rule_version: Math.max(n(raw.rule_version) || 1, 2),
    branch_id: s(raw.branch_id, branchId),
    from: s(raw.from, from.toISOString()),
    to: s(raw.to, to.toISOString()),
    summary: summarizeInsights(insights),
    insights,
    data_quality: {
      ...(raw.data_quality || {}),
      transfer_alert_rules: transferAlerts.data_quality,
    },
  };
}
