# Inventory - QA Guide & AI Prompts

This document serves as a QA guide and provides a set of AI prompts configured specifically to act as a **Senior Application Tester** to verify system quality and business rule compliance. The full, current test case catalogue lives in `CLAUDE.md` §6.

---

## 1. AI Tester Prompts

Use the prompts below when interacting with an AI (such as Gemini, Claude, or ChatGPT) to design test scenarios, review code, or generate test cases.

### A. Customized Prompt (Specific to the Inventory Project)
*Use this prompt when asking the AI to review Next.js code, API routes, Prisma schemas, or PRs (Pull Requests) in this project.*

```markdown
Act as a Senior Application Tester / QA Lead with over 10 years of experience in web, mobile, and API testing. You have a deep understanding of Next.js/Prisma application architectures and the following strict business rules for the "Inventory" project:

1. **Data Separation — Three Axes: Organization × Division × Outlet**:
   - **Organization (tenant):** the app is multi-tenant; every row belongs to one `Organization`.
     Isolation is enforced by a tenant-bound Prisma client (`tenantDb`) and composite foreign keys
     `(organizationId, …)`. Data of another organization MUST be answered with `404` (not `403`)
     so its existence never leaks. Another organization's IDs inside a payload MUST be rejected `400`
     without creating rows.
   - **Division:** divisions (e.g. IT, Kitchen, Engineering) and their categories are dynamic.
     Users MUST ONLY access assets of their own division; otherwise `403`
     `"Unauthorized cross-division access detected."`.
   - **Outlet:** every non-`SUPER_ADMIN` user is assigned one or more branches (`UserBranch`) and
     MUST ONLY see those branches' assets, incidents, BAPs, and transfers; otherwise `403`
     `"Unauthorized cross-branch access detected."`.
   - `SUPER_ADMIN` sees every division and outlet **of its own organization only**.
   - Client-supplied `?branchId=` / `?divisionId=` parameters must never widen access.
   - **Fail closed:** a non-`SUPER_ADMIN` account without a division or without an outlet is denied
     entirely (`403` on API and login, "Akses Ditolak" on pages). A JWT without `organizationId` or
     with a role outside the three tiers is invalid (`401`, cookie cleared). Authorization always
     uses the role/division/outlets read from the database, never the role inside the token.
   - **Cross-outlet transfers:** both outlets can *see* the transfer, but only the **origin**
     outlet may approve or reject it.

2. **Role-Based Access Control (RBAC)** — three tiers:
   - `SUPER_ADMIN`: Full access inside its organization (divisions, categories, branches, users, all assets, all approvals, activity log).
   - `DIVISION_ADMIN`: CRUD assets, incidents, and transfers of its division in its outlets; approves BAP, incident resolutions, and transfers (origin outlet); manages its division's categories. Cannot manage divisions, branches, or users.
   - `DIVISION_STAFF`: Can only view assets, report incidents, propose resolutions, request transfers, and submit BAP. STRICTLY prohibited from editing asset specifications or approving anything.

3. **BAP (Berita Acara Pemeriksaan) Workflow & Stock Model**:
   - One `Asset` row is a stocked item: `quantity = activeQty + brokenQty + repairQty + retiredQty + reservedQty` must always hold; status is derived from the stock buckets.
   - A BAP request reserves only the submitted pcs (`reservedQty`) from a chosen source bucket; the rest stays usable. The asset is fully locked (`BAP_PENDING`) only when all remaining stock is reserved.
   - Approval removes the pcs permanently; status becomes `BAP` only when total stock reaches 0. Rejection returns the pcs to their source bucket.
   - The BAP approval buttons ("Approve" / "Reject") must only appear for the division's admin or Super Admin, and are detected via `Bap.status = PENDING`.

4. **MDM (Mobile Device Management)**:
   - MDM is disabled until it is redesigned per division: every MDM route (`/api/mdm/*`, `/api/assets/[id]/mdm*`) must return `404`.

5. **Mutation/Transfer Approval Workflow**:
   - Initiating a transfer does NOT immediately change the asset's `branchId`. It creates a `Transfer` record with status `PENDING`.
   - Only the origin outlet's division admin or Super Admin can approve or reject a transfer request.
   - When approved, update the `Transfer` status to `APPROVED` and the asset's `branchId` to the target branch inside a Prisma transaction, guarded by `updateMany({ where: { id, status: "PENDING" } })` so two concurrent approvals cannot both succeed.

6. **File Upload and Compression Rules**:
   - All uploaded images for BAP documents (PNG, JPEG, WebP) must be compressed server-side (using `sharp` library) to WebP format (75% quality) and resized to a maximum dimension of 1920px (width or height).
   - PDF uploads must have a strict size limit of 5MB.
   - Save files under `/public/uploads/bap/` grouped by year/month folders (e.g., `/public/uploads/bap/2026/07/`) using unique, randomized/hashed filenames.

YOUR TASK:
Analyze the following code, feature description, or requirement, and produce:
1. Positive & Negative test scenarios (especially targeting tenant isolation, authorization bypass, and RBAC edge cases).
2. Edge cases for database transaction handling (Prisma transactions) and stock invariants.
3. A structured Test Case Table (Test Case ID, Description, Pre-conditions, Steps, Expected Results, Severity).

Here is the code/feature description to test:
[INSERT CODE / FEATURE DESCRIPTION HERE]
```

### B. General Prompt (General Application Testing)
*Use this for testing general features outside the specific business rules of this project.*

```markdown
Act as a Senior QA Engineer with deep expertise in manual & automated testing. Help me design a comprehensive testing suite for the following feature.

Please design scenarios covering:
- Functional & UI/UX Testing
- Boundary Value Analysis (Input boundary conditions)
- Error Handling & Input Validation (SQL Injection, XSS, empty/negative values)
- API/Integration Testing

Present the test cases in a structured table:
| Test Case ID | Feature | Scenario | Pre-conditions | Test Steps | Expected Result | Severity (Low/Medium/High/Critical) |
|---|---|---|---|---|---|---|

Feature to be tested:
[INSERT FEATURE DETAIL HERE]
```

---

## 2. Test Case Template

Use the following markdown structure to document your manual test runs:

### [TC-01] Verify Division Separation (Kitchen admin vs IT asset)
* **Test Type**: Security & Authorization
* **Pre-conditions**: Logged in as `admin_kitchen` (organization code `demo`, Kitchen division, outlet Bogor); target asset `asset-laptop-dell-bogor` belongs to the IT division in the same outlet.
* **Steps**:
  1. Log in to the application as `admin_kitchen`.
  2. Send an HTTP GET request to `/api/assets/asset-laptop-dell-bogor`.
  3. Send an HTTP PUT request to edit the specifications of that asset.
* **Expected Result**:
  * The server returns HTTP status code `403 Forbidden`.
  * The response body contains the error `"Unauthorized cross-division access detected."` with message `"Akses ditolak"`.
* **Status**: ⬜ Pass / ⬜ Fail / ⬜ Blocked
* **Notes**: *Tested by [Name]*

### [TC-02] Verify Organization Isolation (other tenant's asset)
* **Test Type**: Security & Tenant Isolation
* **Pre-conditions**: `APP_MODE="saas"`, seeded; logged in as `superadmin` of organization `demo`; asset `asset-b-laptop` belongs to organization `uji-b`.
* **Steps**:
  1. Send GET, PUT, and DELETE requests to `/api/assets/asset-b-laptop`.
* **Expected Result**:
  * Every request returns `404` without any asset data; the asset still exists in `uji-b`.
* **Status**: ⬜ Pass / ⬜ Fail / ⬜ Blocked

---

## 3. QA Self-Checklist (Business Rules Checklist)

Before deploying changes to production, ensure that you run and pass this checklist:

### 🏢 Tenant Isolation
- [x] Another organization's data answers `404`; its IDs in payloads answer `400` without creating rows.
- [x] Every route and server page gets `db` from `requireUserScope()` / `getPageContext()`; `npm run lint` is clean.
- [x] `npm run test:integration` passes (tenant client, composite foreign keys, `organizationId` on every model).

### 🔒 Authorization & RBAC
- [x] Staff (`DIVISION_STAFF`) cannot see specification editing options or edit buttons.
- [x] Direct API requests to modify assets from staff are rejected with a `403 Forbidden` response.
- [x] Approve/Reject buttons for BAP and Transfer requests are only visible/accessible to Admin and Super Admin roles.
- [x] Accounts without a division or outlet are denied everywhere except logout and `/api/auth/me`.
- [x] Legacy tokens (old role names or no `organizationId`) are rejected with `401` and the cookie is cleared.
- [x] MDM endpoints (`/api/mdm/*`, `/api/assets/[id]/mdm*`) return `404`.

### 📝 BAP & Mutation Workflows
- [x] A BAP request reserves only the submitted pcs; full lock (`BAP_PENDING`) only when all remaining stock is reserved.
- [x] Assets in `BAP_PENDING` status are locked (edit and transfer options are disabled).
- [x] Transferring an asset creates a `PENDING` transfer request and does not immediately modify the asset's `branchId`.
- [x] Database updates for transfer approval are executed inside a Prisma transaction to prevent partial failures.

### 📁 File Uploads
- [x] Uploaded images are compressed into WebP format with a quality setting of 75%.
- [x] Image dimensions do not exceed 1920px on the longest edge.
- [x] PDF uploads exceeding 5MB are rejected with a clear error message.
- [x] File paths match the `/public/uploads/bap/[Year]/[Month]/[random-hash].webp` format.
