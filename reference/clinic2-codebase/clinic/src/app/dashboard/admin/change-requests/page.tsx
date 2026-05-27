"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { hasPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText, CheckCircle2, XCircle, Clock, AlertTriangle,
  Loader2, MessageSquare, User,
} from "lucide-react";
import { format } from "date-fns";

interface ChangeRequestItem {
  id: string;
  type: string;
  details: string;
  status: string;
  response: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requester: { id: string; name: string; designation: string | null; role: string };
  reviewedBy: { id: string; name: string } | null;
}

const STATUS_STYLES: Record<string, { bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING: { bg: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  APPROVED: { bg: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  REJECTED: { bg: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
};

export default function ChangeRequestsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role ?? "THERAPIST";
  const userId = (session?.user as { id?: string })?.id;
  const canReview = hasPermission(userRole, "admin:staff"); // FO/Admin/Owner can review

  const [filter, setFilter] = useState("PENDING");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequestItem | null>(null);
  const [responseText, setResponseText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: requests, loading } = useApiCache<ChangeRequestItem[]>(
    `/api/change-requests${filter !== "ALL" ? `?status=${filter}` : ""}`
  );

  const handleReview = async (status: "APPROVED" | "REJECTED") => {
    if (!selectedRequest || !userId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/change-requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedRequest.id,
          status,
          response: responseText || null,
          reviewedById: userId,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Request ${status.toLowerCase()}`);
      setReviewOpen(false);
      setResponseText("");
      invalidateCache("/api/change-requests");
    } catch {
      toast.error("Failed to process request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6 text-blue-600" /> Change Requests
        </h1>
        <p className="text-sm text-text-tertiary">
          {canReview ? "Review and process requests from clinical staff" : "Track your submitted requests"}
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-surface px-2 py-2 rounded-xl border border-border-light">
        {["PENDING", "APPROVED", "REJECTED", "ALL"].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
              filter === s ? "bg-surface-secondary text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary hover:bg-surface-secondary"
            }`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-surface rounded-xl border border-border-light p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-text-tertiary">Loading requests...</p>
          </div>
        ) : !requests || requests.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border-light p-12 text-center">
            <MessageSquare className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
            <p className="text-sm text-text-tertiary">No {filter !== "ALL" ? filter.toLowerCase() : ""} requests</p>
          </div>
        ) : (
          requests.map(req => {
            const style = STATUS_STYLES[req.status] || STATUS_STYLES.PENDING;
            const Icon = style.icon;
            return (
              <div key={req.id} className="bg-surface rounded-xl border border-border-light p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`${style.bg} border text-xs font-semibold gap-1 shadow-none`}>
                        <Icon className="h-3 w-3" /> {req.status}
                      </Badge>
                      <Badge className="bg-surface-secondary text-text-secondary border-border-light text-[10px] font-semibold shadow-none">
                        {req.type.replace(/_/g, " ")}
                      </Badge>
                    </div>

                    <p className="text-sm text-text-primary font-medium mb-2">{req.details}</p>

                    <div className="flex items-center gap-4 text-xs text-text-tertiary">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {req.requester.name} ({req.requester.designation || req.requester.role})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(req.createdAt), "dd MMM yyyy, HH:mm")}
                      </span>
                    </div>

                    {req.response && (
                      <div className="mt-3 bg-surface-secondary rounded-lg p-3 border border-border-light">
                        <p className="text-[10px] font-semibold text-text-tertiary uppercase mb-1">Response</p>
                        <p className="text-xs text-text-secondary">{req.response}</p>
                        {req.reviewedBy && (
                          <p className="text-[10px] text-text-tertiary mt-1">
                            — {req.reviewedBy.name}, {req.reviewedAt && format(new Date(req.reviewedAt), "dd MMM HH:mm")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {canReview && req.status === "PENDING" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setSelectedRequest(req); setReviewOpen(true); setResponseText(""); }}
                      className="border-border-light text-xs h-8"
                    >
                      Review
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-border-light shadow-xl p-0 overflow-hidden">
          <div className="bg-surface-secondary border-b border-border-light p-5">
            <DialogTitle className="text-text-primary text-base font-bold">Review Change Request</DialogTitle>
          </div>
          {selectedRequest && (
            <div className="p-5 space-y-4">
              <div className="bg-surface-secondary rounded-lg p-3 border border-border-light">
                <p className="text-[10px] font-bold text-text-tertiary uppercase mb-1">Request from {selectedRequest.requester.name}</p>
                <p className="text-sm text-text-primary">{selectedRequest.details}</p>
                <Badge className="mt-2 bg-surface-secondary text-text-secondary border-border-light text-[10px] shadow-none">
                  {selectedRequest.type.replace(/_/g, " ")}
                </Badge>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-secondary">Response Note (optional)</label>
                <Textarea
                  value={responseText}
                  onChange={e => setResponseText(e.target.value)}
                  placeholder="Add a note about your decision..."
                  className="bg-surface border-border-light resize-none min-h-[80px] text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border-light">
                <Button
                  variant="outline"
                  onClick={() => handleReview("REJECTED")}
                  disabled={submitting}
                  className="border-red-200 text-red-700 hover:bg-red-50 text-xs h-9"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
                <Button
                  onClick={() => handleReview("APPROVED")}
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs h-9 px-4"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                  Approve
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
