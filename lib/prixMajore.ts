export interface EmployeMajoration {
  majoration_active?: boolean | null
  majoration_sens?: string | null
  majoration_type?: string | null
  majoration_valeur?: number | null
}

export function prixAvecMajoration(prixBase: number, emp: EmployeMajoration | null | undefined): number {
  if (!emp?.majoration_active) return prixBase
  const signe = emp.majoration_sens === 'baisse' ? -1 : 1
  const valeur = emp.majoration_valeur ?? 0
  const montant = emp.majoration_type === 'pourcentage' ? (prixBase * signe * valeur / 100) : (signe * valeur)
  return prixBase + montant
}
