
type ExpensesMode = "Actual" | "Planning";

type BudgetModel = {
  id: string
  expenses: Array<ExpenseItemModel>
  income: Array<IncomeItemModel>
};

type IncomeItemModel = {
  id: string
  name: string
  amount: MonthlyEquivalentAmount
}

type ExpenseItemModel = {
  id: string
  name: string
  spending: MonthlyEquivalentAmount
  futureMonthlyAmount: number
  excludeFromTotal: boolean
}

type MonthlyEquivalentAmount = {
  perMonth: number
  amount: number
}

export { type BudgetModel, type ExpenseItemModel, type MonthlyEquivalentAmount, type IncomeItemModel, type ExpensesMode }