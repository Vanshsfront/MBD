"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Clock, AlertTriangle, FileText, CalendarDays, X, UserPlus, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  priority: string;
  metadata: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CHANGE_REQUEST: FileText,
  CHANGE_REQUEST_RESPONSE: CheckCheck,
  APPOINTMENT: CalendarDays,
  PACKAGE_EXPIRY: AlertTriangle,
  INTAKE_SUBMITTED: UserPlus,
  PATIENT_ASSIGNED: UserPlus,
  CONSULTATION: Stethoscope,
  GENERAL: Bell,
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "border-l-red-500",
  URGENT: "border-l-red-600",
  NORMAL: "border-l-blue-400",
  LOW: "border-l-slate-300",
};

// Determine the navigation URL based on notification type and metadata
function getNotificationUrl(notif: NotificationItem): string | null {
  let meta: Record<string, unknown> = {};
  if (notif.metadata) {
    try { meta = JSON.parse(notif.metadata); } catch { /* empty */ }
  }
  const actionUrl = meta.actionUrl as string | undefined;
  if (actionUrl) return actionUrl;

  switch (notif.type) {
    case "INTAKE_SUBMITTED":
      return "/dashboard/patients/assign";
    case "PATIENT_ASSIGNED":
      return meta.clientId ? `/dashboard/patients/${meta.clientId}` : "/dashboard/patients";
    case "APPOINTMENT":
      return "/dashboard/appointments/calendar";
    case "CONSULTATION":
      return "/dashboard/sessions/consultations";
    case "CHANGE_REQUEST":
    case "CHANGE_REQUEST_RESPONSE":
      return "/dashboard/admin/change-requests";
    case "PACKAGE_EXPIRY":
      return "/dashboard/packages";
    default:
      return null;
  }
}

export default function NotificationCenter() {
  const { data: session } = useSession();
  const router = useRouter();
  const userId = (session?.user as { id?: string })?.id;

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/notifications?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch { /* silent */ }
  }, [userId]);

  // Fetch on mount and poll every 30s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const markOneRead = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-surface-secondary transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-text-secondary" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-12 z-50 w-96 bg-surface rounded-xl border border-border-light shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-light bg-surface-secondary">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-text-primary">Notifications</h3>
                {unreadCount > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] h-5 px-1.5">
                    {unreadCount} new
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllRead}
                    disabled={loading}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-7"
                  >
                    <CheckCheck className="h-3 w-3 mr-1" /> Mark all read
                  </Button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-slate-200 transition-colors">
                  <X className="h-3.5 w-3.5 text-text-tertiary" />
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-text-tertiary">No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 20).map(notif => {
                  const Icon = TYPE_ICONS[notif.type] || Bell;
                  const priorityBorder = PRIORITY_COLORS[notif.priority] || PRIORITY_COLORS.NORMAL;

                  return (
                    <div
                      key={notif.id}
                      onClick={() => {
                        if (!notif.isRead) markOneRead(notif.id);
                        const url = getNotificationUrl(notif);
                        if (url) {
                          setOpen(false);
                          router.push(url);
                        }
                      }}
                      className={`flex gap-3 px-4 py-3 border-l-4 transition-colors cursor-pointer ${priorityBorder} ${
                        notif.isRead ? "bg-surface opacity-60" : "bg-blue-50/30 hover:bg-blue-50/50"
                      }`}
                    >
                      <div className={`mt-0.5 shrink-0 h-7 w-7 rounded-lg flex items-center justify-center ${
                        notif.priority === "HIGH" || notif.priority === "URGENT"
                          ? "bg-red-100 text-red-600"
                          : "bg-blue-100 text-blue-600"
                      }`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-semibold truncate ${notif.isRead ? "text-text-tertiary" : "text-text-primary"}`}>
                            {notif.title}
                          </p>
                          {!notif.isRead && (
                            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-[11px] text-text-tertiary line-clamp-2 mt-0.5">{notif.message}</p>
                        <p className="text-[10px] text-text-tertiary mt-1 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {format(new Date(notif.createdAt), "dd MMM, HH:mm")}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
