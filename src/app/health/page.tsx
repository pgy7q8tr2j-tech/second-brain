import { getDaySummary, getRangeSummaries, todayJST, addDays } from "@/lib/healthSummary";
import HealthClient from "./HealthClient";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const today = todayJST();
  const [todaySummary, range] = await Promise.all([
    getDaySummary(today),
    getRangeSummaries(addDays(today, -89), today),
  ]);
  return <HealthClient today={todaySummary} range={range} />;
}
