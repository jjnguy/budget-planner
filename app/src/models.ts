
type BudgetItemModel = {
  id: string
  name: string
  spending: BudgetItemSpendingModel
  excludeFromTotal: boolean
}

type BudgetItemSpendingModel = {
  perMonth: number
  amount: number
}

export { type BudgetItemModel, type BudgetItemSpendingModel }