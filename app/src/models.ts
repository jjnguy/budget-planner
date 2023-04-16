
type BudgetModel = {
  id: string
  expenses: Array<ExpenseItemModel>
  income: Array<IncomeItemModel>
};

type IncomeItemModel = {
  id: string
}

type ExpenseItemModel = {
  id: string
  name: string
  spending: ExpenseItemSpendingModel
  excludeFromTotal: boolean
}

type ExpenseItemSpendingModel = {
  perMonth: number
  amount: number
}

export { type BudgetModel, type ExpenseItemModel, type ExpenseItemSpendingModel }