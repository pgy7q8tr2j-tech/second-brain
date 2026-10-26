import { getDaySummary, getRangeSummaries, todayJST, addDays } from "@/lib/healthSummary";
import { listMealItems } from "@/lib/meals";
import HealthClient from "./HealthClient";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const today = todayJST();
  const from = addDays(today, -89);
  const [todaySummary, range, mealItems] = await Promise.all([
    getDaySummary(today),
    getRangeSummaries(from, today),
    listMealItems(from, today),
  ]);
  return <HealthClient today={todaySummary} range={range} mealItems={mealItems} />;
}
