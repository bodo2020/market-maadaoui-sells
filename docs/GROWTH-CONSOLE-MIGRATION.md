# Growth Console split

The customer-facing growth/content modules are now maintained in a dedicated repository:

- `bodo2020/elmadawy-growth-console`

Moved ownership:

- Home Page Builder
- Banners
- Growth / Home analytics and A/B controls
- IT Device Center management

The POS/Admin app no longer exposes these modules in the primary navigation. The existing legacy routes are intentionally kept temporarily as a rollback/deep-link fallback until the standalone Growth Console receives its permanent production URL.

The standalone app continues using the same Supabase project and staff authentication/permissions, so no duplicate operational backend or duplicated customer data is introduced.

Operational POS capabilities such as inventory, finance, sales, HR, orders and the device runtime required by POS remain in this repository.
