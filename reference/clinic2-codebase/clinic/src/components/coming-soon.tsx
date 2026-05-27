import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="bg-slate-900/60 border-slate-800 max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
            <Construction className="h-7 w-7 text-emerald-400" />
          </div>
          <CardTitle className="text-xl text-white">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-slate-400 text-sm">
            {description || "This module is under development and will be available soon."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
