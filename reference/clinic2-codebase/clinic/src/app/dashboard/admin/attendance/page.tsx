"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useApiCache, invalidateCache } from "@/hooks/use-api-cache";
import { hasPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Clock, LogIn, LogOut, Loader2, Calendar, Users, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

interface AttendanceItem {
  id: string;
  staffId: string;
  type: string;
  date: string;
  staff: { id: string; name: string; designation: string | null } | null;
}

interface StaffItem {
  id: string;
  name: string;
  designation: string | null;
  isActive: boolean;
}

export default function AttendancePage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role ?? "THERAPIST";
  const userId = (session?.user as { id?: string })?.id;

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState<string | null>(null);

  const { data: attendance } = useApiCache<AttendanceItem[]>(
    `/api/attendance?date=${selectedDate}`
  );
  const { data: allStaff } = useApiCache<StaffItem[]>("/api/staff");

  const activeStaff = useMemo(() =>
    (allStaff || []).filter(s => s.isActive),
    [allStaff]
  );

  // Build a map: staffId → { checkIn, checkOut }
  const attendanceMap = useMemo(() => {
    const map: Record<string, { checkIn?: AttendanceItem; checkOut?: AttendanceItem }> = {};
    (attendance || []).forEach(a => {
      if (!a.staffId) return;
      if (!map[a.staffId]) map[a.staffId] = {};
      if (a.type === "CHECK_IN") map[a.staffId].checkIn = a;
      if (a.type === "CHECK_OUT") map[a.staffId].checkOut = a;
    });
    return map;
  }, [attendance]);

  const handleClockAction = async (staffId: string, type: "CHECK_IN" | "CHECK_OUT") => {
    setLoading(`${staffId}-${type}`);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, type }),
      });
      if (res.status === 409) {
        const data = await res.json();
        toast.error(data.message || "Already recorded");
        return;
      }
      if (!res.ok) throw new Error("Failed");
      toast.success(`${type === "CHECK_IN" ? "Checked in" : "Checked out"} successfully`);
      invalidateCache("/api/attendance");
    } catch {
      toast.error("Failed to record attendance");
    } finally {
      setLoading(null);
    }
  };

  const checkedInCount = activeStaff.filter(s => attendanceMap[s.id]?.checkIn).length;
  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");
  const canEdit = hasPermission(userRole, "admin:staff");

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <Clock className="h-6 w-6 text-blue-600" /> Staff Attendance
          </h1>
          <p className="text-sm text-text-tertiary">Track daily check-in and check-out for all staff members</p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-surface border-border-light h-9 text-sm w-40"
          />
          {!isToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
              className="border-border-light text-xs h-9"
            >
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-border-light p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-text-tertiary" />
            <span className="text-xs font-semibold text-text-tertiary">Total Staff</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{activeStaff.length}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border-light p-4">
          <div className="flex items-center gap-2 mb-2">
            <LogIn className="h-4 w-4 text-green-500" />
            <span className="text-xs font-semibold text-text-tertiary">Checked In</span>
          </div>
          <p className="text-2xl font-bold text-green-700">{checkedInCount}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border-light p-4">
          <div className="flex items-center gap-2 mb-2">
            <LogOut className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-text-tertiary">Absent</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">{activeStaff.length - checkedInCount}</p>
        </div>
      </div>

      {/* Staff List */}
      <div className="bg-surface rounded-xl border border-border-light overflow-hidden">
        <div className="bg-surface-secondary px-5 py-3 border-b border-border-light">
          <p className="text-xs font-bold text-text-tertiary uppercase tracking-wider">
            {format(new Date(selectedDate), "EEEE, dd MMMM yyyy")}
          </p>
        </div>
        <div className="divide-y divide-border-light">
          {activeStaff.map(staff => {
            const record = attendanceMap[staff.id];
            const hasCheckIn = !!record?.checkIn;
            const hasCheckOut = !!record?.checkOut;

            return (
              <div key={staff.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-secondary/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    hasCheckIn ? "bg-green-100 text-green-700" : "bg-surface-secondary text-text-tertiary"
                  }`}>
                    {staff.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{staff.name}</p>
                    <p className="text-[10px] text-text-tertiary">{staff.designation || "Staff"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Check-in status */}
                  {hasCheckIn ? (
                    <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] font-semibold shadow-none gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      In: {format(new Date(record!.checkIn!.date), "HH:mm")}
                    </Badge>
                  ) : (
                    <Badge className="bg-surface-secondary text-text-tertiary border-border-light text-[10px] shadow-none">
                      Not checked in
                    </Badge>
                  )}

                  {/* Check-out status */}
                  {hasCheckOut ? (
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-semibold shadow-none gap-1">
                      <LogOut className="h-3 w-3" />
                      Out: {format(new Date(record!.checkOut!.date), "HH:mm")}
                    </Badge>
                  ) : hasCheckIn ? (
                    <Badge className="bg-amber-50 text-amber-600 border-amber-200 text-[10px] shadow-none">
                      Working
                    </Badge>
                  ) : null}

                  {/* Action buttons (only for today and if user has permission) */}
                  {isToday && canEdit && (
                    <div className="flex items-center gap-1 ml-2">
                      {!hasCheckIn && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleClockAction(staff.id, "CHECK_IN")}
                          disabled={loading === `${staff.id}-CHECK_IN`}
                          className="text-xs h-7 px-2 text-green-700 hover:bg-green-50"
                        >
                          {loading === `${staff.id}-CHECK_IN` ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3 mr-1" />}
                          In
                        </Button>
                      )}
                      {hasCheckIn && !hasCheckOut && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleClockAction(staff.id, "CHECK_OUT")}
                          disabled={loading === `${staff.id}-CHECK_OUT`}
                          className="text-xs h-7 px-2 text-blue-700 hover:bg-blue-50"
                        >
                          {loading === `${staff.id}-CHECK_OUT` ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3 mr-1" />}
                          Out
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
