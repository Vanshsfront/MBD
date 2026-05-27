"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, History, Edit, PlusCircle, Trash2, ArrowRight, User, Clock, ChevronDown, ChevronUp, Download } from "lucide-react";
import { format } from "date-fns";
import { exportToCSV } from "@/lib/csv-export";

interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  changes: string | null;
  metadata: string | null;
  performedBy: { id: string; name: string; role: string };
  createdAt: string;
}

/* Turn camelCase / snake_case field names into readable labels */
function humanizeField(field: string): string {
  return field
    .replace(/([a-z])([A-Z])/g, "$1 $2")   // camelCase → camel Case
    .replace(/[_-]/g, " ")                    // snake_case → snake case
    .replace(/\b\w/g, c => c.toUpperCase());  // Capitalize words
}

/* Format a value for display — handles null, booleans, dates, etc. */
function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return val.toString();
  if (typeof val === "string") {
    // Try to detect ISO date strings and format them
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
      try { return format(new Date(val), "dd MMM yyyy, hh:mm a"); } catch { /* fall through */ }
    }
    return val;
  }
  return JSON.stringify(val);
}

/* Generate a human-readable summary of the action */
function actionSummary(log: AuditLogItem, metadata: Record<string, unknown> | null, changes: Record<string, { old: unknown; new: unknown }> | null): string {
  const entity = log.entity;
  // Try to get a human-readable subject from metadata
  const clientName = metadata?.clientName as string | undefined;
  const clientCode = metadata?.clientCode as string | undefined;
  const subject = clientName ? ` for ${clientName}` : clientCode ? ` for ${clientCode}` : "";
  const invoiceNum = metadata?.invoiceNumber as string | undefined;
  const invoiceLabel = invoiceNum ? ` #${invoiceNum}` : "";
  const assignedToName = metadata?.assignedToName as string | undefined;
  const consultantName = metadata?.consultantName as string | undefined;
  const therapistName = metadata?.therapistName as string | undefined;
  const serviceName = metadata?.serviceName as string | undefined;

  switch (log.action) {
    case "CREATE":
      if (entity === "Client") return `Registered new patient${subject}`;
      if (entity === "Invoice") return `Created invoice${invoiceLabel}${subject}`;
      if (entity === "Session") return `Logged session${subject}`;
      if (entity === "Payment") return `Recorded payment${subject}`;
      if (entity === "Package") return `Created package${subject}`;
      if (entity === "Consultation") return `Created consultation${subject}${consultantName ? ` by Dr. ${consultantName}` : ""}${serviceName ? ` (${serviceName})` : ""}`;
      if (entity === "Appointment") return `Scheduled appointment${subject}${therapistName ? ` with ${therapistName}` : ""}${serviceName ? ` for ${serviceName}` : ""}`;
      return `Created ${entity}${subject}`;
    case "UPDATE":
      if (entity === "Client") return `Updated patient record${subject}`;
      if (entity === "Invoice") return `Updated invoice${invoiceLabel}${subject}`;
      if (entity === "Session") return `Updated session${subject}`;
      if (entity === "Appointment") return `Modified appointment${subject}`;
      if (entity === "IntakeForm") {
        if (changes?.assignedTo) return `Assigned${subject} to ${assignedToName || changes.assignedTo.new}`;
        if (changes?.frontOfficeExec) return `Front office claimed intake${subject}`;
        return `Updated intake form${subject}`;
      }
      if (entity === "Consultation") return `Updated consultation${subject}`;
      return `Updated ${entity}${subject}`;
    case "DELETE":
      return `Deleted ${entity}${subject}`;
    default:
      return `${log.action} on ${entity}${subject}`;
  }
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState("ALL");
  const [filterAction, setFilterAction] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterEntity !== "ALL") params.append("entity", filterEntity);
        const res = await fetch(`/api/audit?${params.toString()}`);
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [filterEntity]);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const actionColor = (action: string) => {
    const map: Record<string, { bg: string; border: string; text: string; dot: string }> = {
      CREATE: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-500" },
      UPDATE: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
      DELETE: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
    };
    return map[action] || { bg: "bg-surface-secondary", border: "border-border-light", text: "text-text-secondary", dot: "bg-text-tertiary" };
  };

  const actionIcon = (action: string) => {
    switch (action) {
      case "CREATE": return <PlusCircle className="h-4 w-4" />;
      case "UPDATE": return <Edit className="h-4 w-4" />;
      case "DELETE": return <Trash2 className="h-4 w-4" />;
      default: return <Edit className="h-4 w-4" />;
    }
  };

  const parseJson = (str: string | null) => {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
  };

  const filtered = logs.filter(log => {
    const matchesAction = filterAction === "ALL" || log.action === filterAction;
    if (!searchQuery) return matchesAction;
    const q = searchQuery.toLowerCase();
    const metadata: Record<string, unknown> | null = log.metadata ? parseJson(log.metadata) : null;
    const metaClientName = (metadata?.clientName as string || "").toLowerCase();
    const metaClientCode = (metadata?.clientCode as string || "").toLowerCase();
    const metaInvoice = (metadata?.invoiceNumber as string || "").toLowerCase();
    const matchesSearch =
      log.entity.toLowerCase().includes(q) ||
      log.performedBy.name.toLowerCase().includes(q) ||
      log.entityId.toLowerCase().includes(q) ||
      metaClientName.includes(q) ||
      metaClientCode.includes(q) ||
      metaInvoice.includes(q);
    return matchesAction && matchesSearch;
  });

  const handleExportCSV = () => {
    exportToCSV(
      filtered.map(log => {
        const metadata: Record<string, unknown> | null = parseJson(log.metadata);
        return { ...log, _metadata: metadata };
      }),
      [
        { header: "Date", accessor: (r) => format(new Date(r.createdAt), "dd MMM yyyy HH:mm:ss") },
        { header: "Action", accessor: (r) => r.action },
        { header: "Entity", accessor: (r) => r.entity },
        { header: "Patient", accessor: (r) => (r._metadata?.clientName as string) || (r._metadata?.clientCode as string) || "" },
        { header: "Performed By", accessor: (r) => r.performedBy.name },
        { header: "Role", accessor: (r) => r.performedBy.role },
        { header: "Entity ID", accessor: (r) => r.entityId },
      ],
      `audit-trail-${format(new Date(), "yyyy-MM-dd")}`,
    );
  };

  return (
    <div className="space-y-6 pb-12 w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-3">
            <History className="h-8 w-8 text-blue-600" /> Audit Trail
          </h1>
          <p className="text-text-tertiary font-medium">Track who modified data across the system. Every change is logged.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border-light text-text-secondary text-xs font-semibold hover:bg-surface-secondary transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <Badge variant="outline" className="bg-surface-secondary text-text-secondary border-border-light px-3 py-1 text-xs font-semibold">
            {total} Total Entries
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <Input
            placeholder="Search by entity, user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-surface border-border-light focus:ring-blue-500 h-10 shadow-sm"
          />
        </div>
        <Select value={filterEntity} onValueChange={(v) => v && setFilterEntity(v)}>
          <SelectTrigger className="w-40 bg-surface border-border-light h-10"><SelectValue placeholder="Entity" /></SelectTrigger>
          <SelectContent className="bg-surface border-border-light">
            <SelectItem value="ALL">All Entities</SelectItem>
            <SelectItem value="Client">Client</SelectItem>
            <SelectItem value="IntakeForm">Intake / Assignment</SelectItem>
            <SelectItem value="Consultation">Consultation</SelectItem>
            <SelectItem value="Appointment">Appointment</SelectItem>
            <SelectItem value="Session">Session</SelectItem>
            <SelectItem value="Invoice">Invoice</SelectItem>
            <SelectItem value="Payment">Payment</SelectItem>
            <SelectItem value="Package">Package</SelectItem>
            <SelectItem value="Staff">Staff</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 bg-surface rounded-lg border border-border-light p-1">
          {["ALL", "CREATE", "UPDATE", "DELETE"].map(a => (
            <button key={a} onClick={() => setFilterAction(a)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${filterAction === a ? "bg-surface-secondary text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"}`}
            >{a === "ALL" ? "All" : a}</button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex flex-col items-center py-20 text-text-tertiary">
          <Loader2 className="w-7 h-7 animate-spin text-blue-600 mb-3" />
          <p className="font-medium text-sm">Loading audit trail...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-text-tertiary">
          <History className="w-10 h-10 mb-3 opacity-40" />
          <p className="font-medium text-sm">No audit entries found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((log) => {
            const colors = actionColor(log.action);
            const changes: Record<string, { old: unknown; new: unknown }> | null = parseJson(log.changes);
            const metadata: Record<string, unknown> | null = parseJson(log.metadata);
            const changeKeys = changes ? Object.keys(changes) : [];
            const isExpanded = expandedIds.has(log.id);
            const hasChanges = changeKeys.length > 0;

            return (
              <div key={log.id}
                className={`neumorphic-card overflow-hidden`}
              >
                {/* Main Row */}
                <div
                  className="flex items-start gap-4 px-5 py-4 cursor-pointer"
                  onClick={() => hasChanges && toggleExpanded(log.id)}
                >
                  {/* Action Indicator */}
                  <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${colors.bg} ${colors.text}`}>
                    {actionIcon(log.action)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Summary Line */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {actionSummary(log, metadata, changes)}
                        </p>

                        {/* Quick change summary for UPDATE - show inline for small changes */}
                        {log.action === "UPDATE" && hasChanges && changeKeys.length <= 3 && !isExpanded && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {changeKeys.map(key => (
                              <span key={key} className="inline-flex items-center gap-1 text-xs bg-surface-secondary text-text-secondary rounded-md px-2 py-0.5">
                                {humanizeField(key)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <Badge className={`${colors.bg} ${colors.text} ${colors.border} border px-2 py-0.5 text-[10px] font-bold shadow-none flex-shrink-0`}>
                        {log.action}
                      </Badge>
                    </div>

                    {/* Meta: user + time */}
                    <div className="flex items-center gap-4 mt-2 text-xs text-text-tertiary">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        <span className="font-medium text-text-tertiary">{log.performedBy.name}</span>
                        <span className="text-text-tertiary">·</span>
                        <span className="uppercase text-[10px] tracking-wide">{log.performedBy.role}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        <span>{format(new Date(log.createdAt), "dd MMM yyyy")} at {format(new Date(log.createdAt), "hh:mm:ss a")}</span>
                      </span>
                    </div>
                  </div>

                  {/* Expand Button */}
                  {hasChanges && (
                    <button className="mt-1 flex-shrink-0 text-text-tertiary hover:text-text-secondary transition-colors">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  )}
                </div>

                {/* Expanded Change Details */}
                {isExpanded && hasChanges && changes && (
                  <div className="border-t border-border-light bg-surface-secondary/50 px-5 py-4">
                    <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-3">What Changed</p>
                    <div className="space-y-2.5">
                      {changeKeys.map(key => {
                        const change = changes[key];
                        return (
                          <div key={key} className="flex items-start gap-3 text-sm">
                            <span className="font-semibold text-text-secondary min-w-[120px] flex-shrink-0 pt-0.5">
                              {humanizeField(key)}
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center bg-red-50 text-red-700 border border-red-200 rounded-md px-2.5 py-1 text-xs font-medium line-through decoration-red-300">
                                {formatValue(change.old)}
                              </span>
                              <ArrowRight className="h-3.5 w-3.5 text-text-tertiary flex-shrink-0" />
                              <span className="inline-flex items-center bg-green-50 text-green-700 border border-green-200 rounded-md px-2.5 py-1 text-xs font-medium">
                                {formatValue(change.new)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Context / Metadata */}
                    {metadata && Object.keys(metadata).length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border-light/60">
                        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-2">Context</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(metadata).map(([k, v]) => (
                            <span key={k} className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-2.5 py-1 text-xs">
                              <span className="font-semibold">{humanizeField(k)}:</span> {formatValue(v)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
