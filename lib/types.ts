export interface HoraireDay {
  ouvert: boolean
  debut: string
  fin: string
}

export interface Company {
  id: string
  slug: string
  name: string
  domain: string
  logo_url: string
  primary_color: string
  secondary_color: string
  owner_email: string
  email?: string | null
  plan: 'free' | 'starter' | 'pro' | 'enterprise'
  status: 'active' | 'suspended' | 'pending'
  // Apparence
  categorie?: string
  tagline?: string
  font_heading?: string
  font_body?: string
  hero_titre?: string
  hero_description?: string
  hero_image_url?: string
  hero_video_url?: string | null
  hero_circle_1_url?: string | null
  hero_circle_2_url?: string | null
  hero_circle_3_url?: string | null
  hero_circle_4_url?: string | null
  galerie_urls?: string[]
  horaires?: Record<string, HoraireDay>
  reseaux_sociaux?: Record<string, string>
  // Type d'établissement
  business_type?: string | null
  // Terminologie personnalisée
  terme_employe_singulier?: string | null
  terme_employe_pluriel?: string | null
  terme_service?: string | null
  terme_etablissement?: string | null
  // Thème & infos publiques
  theme_id?: string
  about_text?: string
  about_image_url?: string
  telephone?: string
  // Localisation
  adresse?: string
  ville?: string
  code_postal?: string
  province?: string
  pays?: string
  latitude?: number
  longitude?: number
  google_place_id?: string
  localisation_image_url?: string
  // SEO
  seo_title?: string
  seo_description?: string
  seo_keywords?: string
  og_image_url?: string
  site_sections?: string[]
  timezone?: string
  // Fidélité
  fidelite_actif?: boolean
  fidelite_points_par_rdv?: number
  fidelite_points_par_dollar?: number
  fidelite_seuil_cadeau?: number
  fidelite_valeur_cadeau?: number
  fidelite_expiration_jours?: number
  // Remplissage intelligent
  remplissage_actif?: boolean
  remplissage_delai_heures?: number
  remplissage_remise_pct?: number
  remplissage_nb_clients?: number
  remplissage_message?: string | null
  // Parrainage
  parrainage_actif?: boolean
  parrainage_remise_parrain?: number
  parrainage_remise_filleul?: number
  parrainage_message?: string | null
  // Stripe
  stripe_actif?: boolean
  stripe_public_key?: string
  stripe_penalite_pct?: number
  // Onboarding
  trial_ends_at?: string | null
  cgu_accepted_at?: string | null
  onboarding_step?: string | null
  // Politique d'annulation
  delai_annulation_heures?: number | null
  politique_annulation?: string | null
  politique_clause_acceptation?: boolean | null
  politique_clause_frais?: boolean | null
  politique_clause_delai?: boolean | null
  // Quota & abonnement
  subscription_status?: 'trial' | 'active' | 'blocked' | null
  quota_gratuit?: number | null
  couleur_service_enabled?: boolean | null
}

export interface Client {
  id: string
  company_id: string
  prenom: string
  nom: string
  email: string
  telephone: string
  points_fidelite: number
  est_bloque: boolean
  total_visites?: number
  total_depenses?: number
  derniere_visite?: string | null
  premiere_visite?: string | null
  date_anniversaire?: string | null
  segment?: 'nouveau' | 'regulier' | 'vip' | 'inactif' | 'frequent'
}

export interface Reservation {
  id: string
  company_id: string
  client_id: string | null
  barbier: string
  service: string
  prix: number
  date_rdv: string
  heure_rdv: string
  statut: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  cancel_token?: string | null
  duree_rdv?: number | null
  client_prenom?: string | null
  client_nom?: string | null
  client_email?: string | null
  client_telephone?: string | null
}

export interface Employee {
  id: string
  company_id: string
  nom: string
  prenom?: string
  genre?: string
  photo_url?: string | null
  actif: boolean
  date_naissance?: string | null
  telephone?: string | null
  email?: string | null
  adresse?: string | null
  ville?: string | null
  code_postal?: string | null
  type_contrat?: 'temps_plein' | 'temps_partiel' | 'sur_appel' | 'freelance' | null
  specialites?: string[] | null
  bio?: string | null
  date_embauche?: string | null
  couleur_agenda?: string | null
  visible_booking?: boolean
  majoration_active?: boolean | null
  majoration_sens?: 'hausse' | 'baisse' | null
  majoration_type?: 'pourcentage' | 'montant_fixe' | null
  majoration_valeur?: number | null
  majoration_label?: string | null
  jours_vacances_annuels?: number
  titre?: string | null
  mode_remuneration?: 'aucun' | 'commission' | 'horaire' | 'fixe' | null
  taux_commission?: number | null
  taux_horaire?: number | null
  salaire_mensuel?: number | null
  created_at?: string
}

export interface EmployeSoldeVacances {
  employe_id: string
  company_id: string
  nom: string
  prenom?: string | null
  jours_vacances_annuels: number
  jours_utilises: number
  jours_restants: number
}

export interface Subscription {
  id: string
  company_id: string
  plan: 'free' | 'starter' | 'pro' | 'enterprise'
  status: 'active' | 'trialing' | 'past_due' | 'cancelled'
  stripe_id: string
  next_billing_date: string
}

export interface Depense {
  id: string
  company_id: string
  montant: number
  description: string
  categorie: 'loyer' | 'fournitures' | 'equipement' | 'marketing' | 'salaires' | 'taxes' | 'assurances' | 'services' | 'autre'
  type_charge: 'fixe' | 'variable'
  date_depense: string
  justificatif_url?: string | null
  created_at: string
}

export interface Encaissement {
  id: string
  company_id: string
  reservation_id: string | null
  employe_id: string | null
  client_nom: string | null
  service: string | null
  montant_base: number
  pourboire: number
  penalite: number
  remise: number
  total: number
  methode_paiement: 'comptant' | 'carte' | 'virement' | 'autre'
  statut: 'encaisse' | 'annule' | 'rembourse'
  note: string | null
  date_encaissement: string
  created_at: string
  employes?: { nom: string }[] | null
}

export interface Campagne {
  id: string
  company_id: string
  nom: string
  canal: 'sms' | 'email' | 'les_deux'
  segment_cible: 'tous' | 'nouveau' | 'regulier' | 'frequent' | 'vip' | 'inactif' | 'anniversaire'
  sujet_email?: string | null
  message_email?: string | null
  message_sms?: string | null
  statut: 'brouillon' | 'planifie' | 'en_cours' | 'envoye' | 'erreur'
  nb_destinataires: number
  nb_envoyes: number
  nb_erreurs: number
  planifie_at?: string | null
  envoye_at?: string | null
  created_at: string
  updated_at?: string
}

export interface CampagneEnvoi {
  id: string
  campagne_id: string
  company_id: string
  client_email: string
  client_telephone?: string | null
  canal: string
  statut: 'envoye' | 'erreur'
  erreur_detail?: string | null
  created_at: string
}

export interface PointsRule {
  id: string
  company_id: string
  points_par_reservation: number
  points_par_euro: number
  seuil_cadeau: number
  valeur_cadeau: number
  created_at: string
  updated_at: string
}

export type RelanceType = 'rappel_rdv' | 'rappel_rdv_h2' | 'inactif' | 'anniversaire' | 'no_show'

export interface RelanceConfig {
  id: string
  company_id: string
  type: RelanceType
  actif: boolean
  canal: 'email' | 'sms' | 'les_deux'
  delai_jours: number | null
  sujet_email: string | null
  message_email: string | null
  message_sms: string | null
  created_at?: string
  updated_at?: string
}

export interface RelanceEnvoyee {
  id: string
  company_id: string
  client_email: string
  client_telephone?: string | null
  type: string
  canal: string
  statut: 'envoye' | 'erreur' | 'ignore'
  reservation_id?: string | null
  message_envoye?: string | null
  erreur_detail?: string | null
  created_at: string
}

export interface FideliteHistorique {
  id: string
  company_id: string
  client_email: string
  points: number
  type: 'rdv_complete' | 'bonus_depense' | 'cadeau_utilise' | 'manuel' | 'expiration'
  reservation_id?: string | null
  note?: string | null
  created_at: string
}

export interface RemplissageOffre {
  id: string
  company_id: string
  creneau_date: string
  creneau_heure: string
  employee_id?: string | null
  client_email: string
  code_promo_id?: string | null
  statut: 'envoye' | 'reserve' | 'expire'
  created_at: string
}

export interface CodePromo {
  id: string
  company_id: string
  code: string
  nom: string
  type_remise: 'pourcentage' | 'montant_fixe'
  valeur_remise: number
  type_promo: 'standard' | 'happy_hour' | 'nouveau_client' | 'limite'
  service_id?: string | null
  nb_utilisations_max?: number | null
  nb_utilisations: number
  actif: boolean
  date_debut?: string | null
  date_fin?: string | null
  heure_debut?: string | null
  heure_fin?: string | null
  jours_semaine?: number[] | null
  created_at: string
  updated_at?: string
}

export interface PromoUtilisation {
  id: string
  code_promo_id: string
  client_email: string
  remise_appliquee: number
  reservation_id?: string | null
  created_at: string
}

export interface ClientProfile {
  id: string
  company_id: string
  prenom: string
  nom: string
  email: string
  telephone?: string
  avatar_url?: string | null
  date_naissance?: string | null
  adresse?: string | null
  ville?: string | null
  code_postal?: string | null
  segment?: string | null
  points_fidelite?: number
  total_visites?: number
  actif: boolean
  created_at: string
}

export interface Parrainage {
  id: string
  company_id: string
  parrain_email: string
  parrain_prenom: string | null
  filleul_email: string | null
  filleul_prenom: string | null
  code_parrainage: string
  statut: 'en_attente' | 'complete' | 'expire'
  code_promo_parrain_id: string | null
  code_promo_filleul_id: string | null
  rdv_filleul_id: string | null
  created_at: string
  complete_at: string | null
}

export interface EmployeStatutJour {
  id: string
  company_id: string
  employe_id: string
  date_statut: string
  statut: 'travaille' | 'conge' | 'maladie' | 'permission' | 'formation' | 'indisponible'
  note: string | null
  created_at: string
}

export interface EmployeDemandeRH {
  id: string
  company_id: string
  employe_id: string
  type_demande: 'conge' | 'maladie' | 'permission' | 'changement_horaire' | 'extra_shift' | 'document_administratif'
  date_debut: string
  date_fin: string
  motif: string | null
  statut: 'en_attente' | 'approuve' | 'refuse'
  commentaire_manager: string | null
  type_document?: string | null
  date_souhaitee?: string | null
  note_manager?: string | null
  created_at: string
  updated_at: string
}

export interface EmployeGratification {
  id: string
  company_id: string
  employe_id: string
  type_gratif: 'bonus' | 'felicitations' | 'prime'
  montant: number
  message: string
  lu: boolean
  created_at: string
}

export interface EmployeNotification {
  id: string
  company_id: string
  employe_id: string
  type: string
  titre: string
  message: string
  lu: boolean
  created_at: string
}

export interface FideliteCadeau {
  id: string
  company_id: string
  client_email: string
  code: string
  valeur: number
  points_utilises: number
  statut: 'actif' | 'utilise' | 'expire'
  expire_at?: string | null
  utilise_at?: string | null
  reservation_id?: string | null
  notifie_at?: string | null
  created_at: string
}
