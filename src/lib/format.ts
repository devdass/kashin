export function formatMoney(amount: number, currency = "NZD") {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

export function formatDate(value: string, options?: { short?: boolean }) {
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: options?.short ? "medium" : "long",
    timeZone: "Pacific/Auckland",
  }).format(new Date(value));
}

export function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    month: "long",
    year: "numeric",
    timeZone: "Pacific/Auckland",
  }).format(new Date(value));
}
