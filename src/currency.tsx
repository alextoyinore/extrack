import { createContext, useContext } from 'react'

const CurrencyContext = createContext('USD')

export function CurrencyProvider({ currency, children }: { currency: string; children: React.ReactNode }) {
  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>
}

export function useCurrency() {
  return useContext(CurrencyContext)
}

export function useMoney() {
  const currency = useCurrency()
  return (value: number) => formatMoney(value, currency)
}

export function formatMoney(value: number, currency: string) {
  const symbols: Record<string, string> = { USD: '$', NGN: '₦', CAD: 'C$', AUD: 'A$', GBP: '£', EUR: '€', CHF: 'CHF ', INR: '₹', JPY: '¥', CNY: '¥', ZAR: 'R' }
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
  return `${symbols[currency] || `${currency} `}${number}`
}
