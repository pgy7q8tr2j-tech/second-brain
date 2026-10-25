import { getDaySummary, todayJST } from "@/lib/healthSummary";
import HealthClient from "./HealthClient";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const today = await getDaySummary(todayJST());
  return <HealthClient today={today} />;
}
