
type MonthlyRate = {
  name: string
  perMonth: number
}

let rates: Array<MonthlyRate> = [
  {
    name: "Month",
    perMonth: 1,
  },
  {
    name: "Week",
    perMonth: 4.35,
  },
  {
    name: "Year",
    perMonth: 1 / 12,
  },
  {
    name: "Bi-Week",
    perMonth: 2.15,
  },
]

export { type MonthlyRate, rates };