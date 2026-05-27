import "@/app/globals.css";

export const metadata = {
  title: "Patient Portal — Movement by Design",
  description: "View your treatment progress, session history, and billing information.",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
