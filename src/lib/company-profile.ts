/** Single-tenant company record (local demo — persisted in SQLite). */
export interface CompanyProfile {
  companyName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  hqLine1: string | null;
  hqLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  website: string | null;
  updatedAt: string | null;
}

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyName: "Your company",
  contactEmail: null,
  contactPhone: null,
  hqLine1: null,
  hqLine2: null,
  city: null,
  state: null,
  postalCode: null,
  website: null,
  updatedAt: null,
};
