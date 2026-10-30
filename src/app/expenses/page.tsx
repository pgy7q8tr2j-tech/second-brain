import { listExpenses, getExpenseCategories, getGbpJpyRate } from "@/lib/expenses";
import { todayJST, addDays } from "@/lib/healthSummary";
import ExpensesClient from "./ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const today = todayJST();
  const from = addDays(today, -366);
  const [expenses, categories, gbpJpyRate] = await Promise.all([
    listExpenses({ from, to: today }),
    getExpenseCategories(),
    getGbpJpyRate(),
  ]);

  return (
    <ExpensesClient expenses={expenses} categories={categories} gbpJpyRate={gbpJpyRate} today={today} />
  );
}
