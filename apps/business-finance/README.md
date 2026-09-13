# Elmadawy Business & Finance

Standalone reporting and finance frontend for Elmadawy Market.

## Design system
The visual tokens mirror the current Customer App AppDesign source: primary `#0B5D3B`, primary dark `#07472E`, primary light `#E8F3EE`, secondary `#E0A21A`, background `#F6F8F7`, surface `#FFFFFF`, text `#17231D`, Cairo / RTL and the same radius scale.

## Backend contract
The frontend does **not** calculate financial truth from legacy `sales.items` JSON and does not display fabricated fallback KPIs. It uses the existing permission-aware Reporting V2 and Finance RPCs:
- `get_my_staff_identity`
- `get_my_staff_branches`
- `get_reporting_overview_v2`
- `get_reporting_payments_v2`
- `get_finance_control_center_v2`

The reporting backend uses Invoice V2 snapshots and the financial/payment/cash ledgers with branch scope and authorization applied server-side. The UI filters available branches and sections using the canonical staff permission context.

## Local setup
```bash
cp .env.example .env
npm install
npm run dev
```
The current Elmadawy project URL and public client key are configured as safe defaults. Environment variables override them for staging or future environments.

## Current scope
- Supabase session login
- Mobile-first responsive shell
- Home executive overview
- Reporting catalog
- Live branch selector based on staff permissions
- Cairo-time period filters with prior-period comparison
- Live POS/online KPIs and dynamic payment methods
- Finance accounts, cash/payment ledgers and period cash flow
- Profit waterfall with an explicit POS-only profit scope warning while online COGS is incomplete
- Financial notification center shell
- Admin/settings shell
- Explicit no-fake-data behavior while Reporting V2 RPCs are pending
