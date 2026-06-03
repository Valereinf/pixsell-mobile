import { createContext, useContext } from 'react'
import type { Company } from './types'

interface OwnerContextType {
  company: Company | null
  setCompany: (c: Company) => void
}

export const OwnerContext = createContext<OwnerContextType>({
  company: null,
  setCompany: () => {},
})

export const useOwnerContext = () => useContext(OwnerContext)
