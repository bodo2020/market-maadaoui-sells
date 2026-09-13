# Elmadawy Business & Finance

Standalone reporting and finance frontend for Elmadawy Market.

## Design system
The visual tokens mirror the current Customer App AppDesign source: primary `#0B5D3B`, primary dark `#07472E`, primary light `#E8F3EE`, secondary `#E0A21A`, background `#F6F8F7`, surface `#FFFFFF`, text `#17231D`, Cairo / RTL and the same radius scale.

## Backend contract
The frontend does **not** calculate financial truth from legacy `sales.items` JSON and does not display fabricated fallback KPIs. It expects permission-aware server RPCs:
- `get_business_finance_overview`
- `get_business_finance_accounts`
- `get_business_finance_cashflow`

Until these are deployed, the UI shows an explicit engine-not-connected state instead of misleading values. The reporting backend should use Invoice V2 snapshots and the financial/payment/cash ledgers with branch scope and RLS applied server-side.

## Local setup
```bash
cp .env.example .env
npm install
npm run dev
```
Set the same Supabase project URL and public/publishable key used by the target Elmadawy environment.

## Current scope
- Supabase session login
- Mobile-first responsive shell
- Home executive overview
- Reporting catalog
- Finance accounts + cash-flow shell
- Financial notification center shell
- Admin/settings shell
- Explicit no-fake-data behavior while Reporting V2 RPCs are pending
