# AIPCSS Frontend — Design Analysis & Improvement Plan

> **Project:** AIPCSS (Automated Institutional Program Course Scheduling System)
> **Version Analyzed:** AIPCSS-main (master branch)
> **Analysis Date:** 2025-07-09
> **Scope:** Full frontend source code — `/frontend/src/` (45 files, ~9,500+ LOC)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Overview](#2-project-overview)
3. [Technology Stack](#3-technology-stack)
4. [Architecture Analysis](#4-architecture-analysis)
5. [Component Architecture](#5-component-architecture)
6. [Styling & Design System](#6-styling--design-system)
7. [Data Flow & State Management](#7-data-flow--state-management)
8. [Page-by-Page Analysis](#8-page-by-page-analysis)
9. [Service Layer & API Integration](#9-service-layer--api-integration)
10. [Accessibility Audit](#10-accessibility-audit)
11. [Performance Analysis](#11-performance-analysis)
12. [Security Analysis](#12-security-analysis)
13. [Code Quality Metrics](#13-code-quality-metrics)
14. [Critical Issues (Must Fix)](#14-critical-issues-must-fix)
15. [Improvement Roadmap](#15-improvement-roadmap)

---

## 1. Executive Summary

### Overall Grade: **C+ (6.1/10)**

AIPCSS is a feature-rich academic timetable management system built with cutting-edge technologies (React 19, Vite 7, Tailwind CSS 4, Zod 4). The application delivers substantial functionality — CRUD management for 8 entity types, AI-powered schedule generation with real-time WebSocket progress, bulk data import, workload assignment, and a dashboard with analytics.

However, the frontend suffers from **critical accessibility gaps**, **widespread code duplication**, **inconsistent styling practices**, and **no client-side data caching**. The most complex page (TimetablePage at 2,437 lines) is a monolith that mixes multiple concerns. While the foundation is solid, significant architectural improvements are needed for production readiness.

### Key Strengths
- Modern tech stack with excellent library choices
- Clean Context provider pattern (3-file separation)
- Sophisticated JWT refresh with concurrent deduplication
- Comprehensive glassmorphism design system with full dark mode
- Consistent CRUD template across 8 entity pages
- Strong TypeScript typing for domain models

### Key Weaknesses
- WCAG 2.1 Level A accessibility failures (score: 3.5/10)
- 60–70% structural code duplication across CRUD pages
- Three incompatible styling methods mixed throughout
- Zero client-side data caching (no React Query/SWR)
- 2,437-line TimetablePage monolith with dead DnD imports
- Pervasive `as any` type casts (~40+ instances)

---

## 2. Project Overview

### 2.1 Application Purpose

AIPCSS automates the complex process of creating academic timetables. It manages:

| Domain | Entities |
|--------|----------|
| **Organizational** | Departments, Programs, Batches, Sections |
| **Resources** | Teachers (with availability), Rooms (with types/capacity) |
| **Academic** | Courses (with types, credits, semesters) |
| **Scheduling** | Timetable generation (3 AI engines), manual entries, workload assignment |
| **Configuration** | Working days, time slots, breaks, engine selection |

### 2.2 Feature Inventory

| Feature | Implementation | Status |
|---------|---------------|--------|
| Entity CRUD (8 types) | React-hook-form + Zod + DataTable | ✅ Complete |
| Bulk Import (XLSX) | BulkImportModal per entity | ✅ Complete |
| Server-side Auth | JWT access/refresh tokens | ✅ Complete |
| Dashboard Analytics | Recharts visualizations | ✅ Complete (fake data) |
| AI Schedule Generation | 3 engines + WebSocket progress | ✅ Complete |
| Manual Timetable Entry | Per-cell creation/deletion | ✅ Complete |
| CSV Export | Client-side generation | ⚠️ No field quoting |
| Dark/Light Theme | CSS custom properties | ✅ Complete |
| Workload Assignment | Two-mode selection → mapping | ✅ Complete |
| Schedule Settings | Days, slots, breaks config + preview | ✅ Complete |
| Drag & Drop | @dnd-kit installed | ❌ Dead code (unused) |
| Real-time Updates | Socket.IO client installed | ⚠️ Only generation progress |

### 2.3 File Structure

```
frontend/src/
├── App.tsx                    # Root component, routing, providers
├── App.css                    # ⚠️ Dead code (Vite boilerplate)
├── index.css                  # Design system (895 lines)
├── main.tsx                   # Entry point
├── assets/                    # Static assets
├── components/
│   ├── common/
│   │   ├── DataTable.tsx      # Generic table with search/sort/pagination
│   │   └── BulkImportModal.tsx # File upload modal
│   ├── layout/
│   │   ├── AppLayout.tsx      # Main shell (sidebar + header + content)
│   │   ├── ProtectedRoute.tsx # Auth guards
│   │   └── Sidebar.tsx        # ⚠️ Also exports Header component
│   └── ui/
│       ├── Loading.tsx        # Spinner, PageLoader, Skeleton, EmptyState, ErrorState
│       ├── Modal.tsx          # Modal, ConfirmModal
│       ├── Select.tsx         # Custom Select, NativeSelect
│       └── ToastContainer.tsx # Toast notification display
├── context/
│   ├── AuthContext.tsx        # Auth provider
│   ├── ThemeContext.tsx       # Theme provider
│   ├── ToastContext.tsx       # Toast provider
│   ├── auth-context.ts        # Context type definition
│   ├── theme-context.ts       # Context type definition
│   ├── toast-context.ts       # Context type definition
│   ├── useAuth.ts             # Consumer hook
│   ├── useTheme.ts            # Consumer hook
│   └── useToast.ts            # Consumer hook
├── hooks/
│   └── useTable.ts            # Client-side search/sort/pagination
├── lib/
│   ├── axios.ts               # Axios instance + JWT refresh interceptor
│   └── utils.ts               # getErrorMessage, getInitials, DAYS, SLOTS
├── pages/
│   ├── DashboardPage.tsx      # Analytics hub (394 lines)
│   ├── TimetablePage.tsx      # ⚠️ Schedule grid (2,437 lines)
│   ├── TeachersPage.tsx       # Teacher CRUD (534 lines)
│   ├── CoursesPage.tsx        # Course CRUD (277 lines)
│   ├── RoomsPage.tsx          # Room CRUD (340 lines)
│   ├── SectionsPage.tsx       # Section CRUD (237 lines)
│   ├── BatchesPage.tsx        # Batch CRUD (502 lines)
│   ├── DepartmentsPage.tsx    # Department CRUD (225 lines)
│   ├── ProgramsPage.tsx       # Program CRUD (223 lines)
│   ├── WorkloadPage.tsx       # Workload assignment (457 lines)
│   ├── SettingsPage.tsx       # Schedule config (814 lines)
│   └── auth/
│       ├── LoginPage.tsx      # Login form (239 lines)
│       └── RegisterPage.tsx   # Registration form (146 lines)
├── services/
│   ├── auth.service.ts        # Auth API (42 lines)
│   ├── curriculum.service.ts  # Curriculum API (155 lines)
│   ├── resources.service.ts   # 6 CRUD services (287 lines)
│   ├── scheduling.service.ts  # Schedule API (68 lines)
│   └── settings.service.ts    # Settings API (26 lines)
└── types/
    └── index.ts               # Domain types (326 lines)
```

---

## 3. Technology Stack

### 3.1 Core Dependencies

| Category | Package | Version | Notes |
|----------|---------|---------|-------|
| **Framework** | React | 19.2.0 | Bleeding edge — some 3rd-party lib compatibility risk |
| **Build Tool** | Vite | 7.3.1 | Very fast HMR, native ESM |
| **Routing** | React Router | 7.13.1 | Stable, widely adopted |
| **Styling** | Tailwind CSS | 4.2.1 | CSS-native config (`@theme`) — no PostCSS config |
| **Language** | TypeScript | 5.9.3 | Strict mode enabled |
| **Forms** | React Hook Form | 7.71.2 | Performance-optimized forms |
| **Validation** | Zod | 4.3.6 | Schema validation |
| **HTTP** | Axios | 1.13.5 | Interceptor-based auth |
| **Realtime** | Socket.IO Client | 4.8.3 | WebSocket for schedule generation |
| **Charts** | Recharts | 3.7.0 | Dashboard analytics |
| **DnD** | @dnd-kit | 6–10.x | ⚠️ Installed but unused in render code |
| **Date** | date-fns | 4.1.0 | Date formatting |
| **UI Primitives** | @radix-ui/* | Various | Dialog, Select, Dropdown, Toast, Tabs, Switch, Avatar |
| **Icons** | lucide-react | 0.575.0 | Comprehensive icon set |
| **Class Utils** | clsx + tailwind-merge + CVA | Latest | Class composition |

### 3.2 Version Risk Assessment

| Package | Risk Level | Rationale |
|---------|-----------|-----------|
| React 19 | 🟡 Medium | Very new; ecosystem libraries may lag |
| Vite 7 | 🟡 Medium | Bleeding edge; some plugins may not support |
| Tailwind CSS 4 | 🟡 Medium | Major rewrite; different config paradigm |
| Zod 4 | 🟡 Medium | Breaking changes from v3; resolver compatibility |
| React Router 7 | 🟢 Low | Stable, well-maintained |
| Axios / TypeScript | 🟢 Low | Mature, stable |

### 3.3 Unused Dependencies

| Package | Status | Recommendation |
|---------|--------|----------------|
| `@dnd-kit/*` (4 packages) | Installed, dead imports in TimetablePage | Remove or implement DnD timetable editing |
| `@radix-ui/react-dialog` | Installed but Modal.tsx is custom | Replace custom Modal with Radix Dialog |
| `@radix-ui/react-select` | Installed but Select.tsx is custom | Replace custom Select with Radix Select |
| `@radix-ui/react-dropdown-menu` | Partially used in Sidebar | Expand usage to all dropdowns |
| `@radix-ui/react-tabs` | Not observed in any component | Use in SettingsPage or TimetablePage |
| `@radix-ui/react-switch` | Not observed in any component | Use in SettingsPage toggle |
| `class-variance-authority` | Not observed in components | Use for button/form variant management |

---

## 4. Architecture Analysis

### 4.1 High-Level Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                          index.html                           │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  ThemeProvider → AuthProvider → ToastProvider            │  │
│  │  ┌───────────────────────────────────────────────────┐  │  │
│  │  │  BrowserRouter                                    │  │  │
│  │  │  ├─ PublicRoute → LoginPage / RegisterPage       │  │  │
│  │  │  └─ ProtectedRoute → AppLayout                    │  │  │
│  │  │       ├─ Header (sticky, glassmorphism)           │  │  │
│  │  │       ├─ Sidebar (fixed, collapsible)             │  │  │
│  │  │       └─ <main>                                  │  │  │
│  │  │           ├─ DashboardPage (Recharts)             │  │  │
│  │  │           ├─ DepartmentsPage → ProgramsPage       │  │  │
│  │  │           ├─ BatchesPage → SectionsPage           │  │  │
│  │  │           ├─ TeachersPage (availability grid)     │  │  │
│  │  │           ├─ CoursesPage / RoomsPage              │  │  │
│  │  │           ├─ TimetablePage (WebSocket + grid)     │  │  │
│  │  │           ├─ WorkloadPage (teacher↔course map)    │  │  │
│  │  │           └─ SettingsPage (schedule config)       │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│       ↑ Axios (JWT auto-refresh)  ↑ Socket.IO (gen progress) │
│       ↓ Vite proxy (/api → :5000) ↓ Vite proxy (/socket.io)  │
└───────────────────────────────────────────────────────────────┘
```

### 4.2 Architectural Patterns

| Pattern | Implementation | Assessment |
|---------|---------------|------------|
| **Context Provider** | Theme, Auth, Toast — each with 3-file pattern | ✅ Excellent |
| **Route Guards** | ProtectedRoute / PublicRoute wrappers | ✅ Good |
| **CRUD Page Template** | Identical structure across 8 pages | ⚠️ Should be abstracted |
| **Service Layer** | Per-domain service objects | ⚠️ Massive duplication |
| **Custom Hooks** | useTable, useAuth, useTheme, useToast | ✅ Good pattern |
| **Composition** | Modal children, EmptyState action slot | ✅ Excellent |
| **Controlled Components** | DataTable, Select, Modal | ✅ Predictable |

### 4.3 Architectural Problems

#### Problem 1: No Data Caching Layer

The application has **zero client-side caching**. Every page navigation triggers a full API fetch, even for reference data (departments, rooms, etc.) that rarely changes. This results in:
- Unnecessary network requests
- Flash of loading state on every navigation
- No stale-while-revalidate capability
- No request deduplication

**Impact:** Poor UX (loading spinners everywhere), wasted bandwidth, slower perceived performance.

#### Problem 2: Auth Context ↔ Axios Disconnect

When the Axios interceptor force-logs out (on refresh token failure), it uses `window.location.href = '/login'` and directly manipulates `localStorage`. This **bypasses the AuthContext** entirely:
- React state still thinks user is authenticated
- Any in-memory data persists
- No React lifecycle cleanup occurs

#### Problem 3: TimetablePage Monolith

At **2,437 lines** with 28+ state variables, 15+ functions, and 7 sub-views, this file violates the Single Responsibility Principle. It contains:
- Batch timetable grid view
- AI generation panel with WebSocket
- Readiness checker
- Manual entry modal
- Conflict resolution (unused)
- CSV export
- Statistics display

---

## 5. Component Architecture

### 5.1 Component Quality Scores

| Component | Reusability | Completeness | Quality | A11y |
|-----------|:-----------:|:------------:|:-------:|:----:|
| `Modal` / `ConfirmModal` | 9/10 | 6/10 | 6/10 | ❌ |
| `Select` / `NativeSelect` | 6/10 | 5/10 | 4/10 | ❌ |
| `Spinner` → `TableSkeleton` | 10/10 | 9/10 | 9/10 | ✅ |
| `EmptyState` / `ErrorState` | 9/10 | 8/10 | 8/10 | ⚠️ |
| `ToastContainer` | 8/10 | 8/10 | 8/10 | ✅ |
| `DataTable<T>` | 8/10 | 9/10 | 6/10 | ⚠️ |
| `BulkImportModal` | 5/10 | 8/10 | 5/10 | ❌ |
| `AppLayout` | 4/10 | 6/10 | 5/10 | ⚠️ |
| `Sidebar` | 7/10 | 8/10 | 7/10 | ⚠️ |
| `ProtectedRoute` | 8/10 | 9/10 | 9/10 | ✅ |

### 5.2 Component Issues

#### Issue 1: File Naming Violation
`Sidebar.tsx` exports both `Sidebar` AND `Header` — violates Single Responsibility Principle. Should be split into `Sidebar.tsx` and `Header.tsx`.

#### Issue 2: Duplicate Click-Outside Logic
Identical `useEffect` + `mousedown` listener pattern exists in both `Header` (Sidebar.tsx) and `Select.tsx`. Should be extracted to a `useClickOutside` hook.

#### Issue 3: Modal Accessibility Failures
Custom `Modal` lacks:
- `role="dialog"` and `aria-modal="true"`
- Focus trapping (user can tab behind modal)
- `Escape` key handler to close
- Body scroll lock
- `aria-labelledby` connecting dialog to title

**Recommendation:** Replace with `@radix-ui/react-dialog` (already installed).

#### Issue 4: Custom Select Completely Inaccessible
The custom `Select` component has:
- No `role="listbox"` / `role="option"`
- No `aria-expanded`, `aria-selected`
- No keyboard navigation (arrow keys, Escape, Enter)
- No focus management

**Recommendation:** Replace with `@radix-ui/react-select` (already installed).

#### Issue 5: DataTable Row Key Anti-Pattern
Uses array index (`<tr key={i}>`) instead of unique identifiers, causing React reconciliation issues when rows are reordered or sorted.

---

## 6. Styling & Design System

### 6.1 Design System Overview

The app uses a **glassmorphism-first design language** with full light/dark mode support, defined in `index.css` (~895 lines):

#### CSS Architecture (3 layers)

```
@layer base       → Theme variables, global reset, body styles
@layer components → 50+ reusable component classes
@layer utilities  → .text-gradient, .glass, .animate-enter
```

#### Theme Token System

```css
/* Light / Dark via CSS custom properties */
:root / .dark {
  --text-primary, --text-secondary, --text-muted
  --bg-card, --bg-glass, --bg-light, --bg-input
  --border, --primary, --primary-hover
  --shadow-card, --shadow-elevated, --shadow-floating
  --font-body (Inter), --font-display (Plus Jakarta Sans)
}
```

#### Tailwind v4 Theme Extension

```css
@theme {
  --color-primary-*: blue 50–950;
  --color-surface-*: slate 50–950;
  --color-accent-*: teal, violet, amber, rose, emerald;
  --font-sans: Inter, sans-serif;
  --radius-*: sm → 2xl;
}
```

#### Component Class Library (~50 classes)

| Category | Examples |
|----------|----------|
| **Buttons** | `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`, `.btn-sm`, `.btn-lg`, `.btn-icon` |
| **Cards** | `.card`, `.card-elevated` |
| **Forms** | `.input`, `.label`, `.form-group`, `.error-msg`, `.input-error` |
| **Badges** | `.badge-blue`, `.badge-green`, `.badge-amber`, `.badge-red`, `.badge-violet` |
| **Table** | `.table-wrapper`, `.table` |
| **Modal** | `.modal-overlay`, `.modal-content`, `.modal-header/body/footer` |
| **Sidebar** | `.sidebar`, `.sidebar-item`, `.sidebar-section-label` |
| **Loading** | `.spinner`, `.page-loader`, `.skeleton` |
| **Toast** | `.toast`, `.toast-success`, `.toast-error`, `.toast-warning`, `.toast-info` |
| **Timetable** | `.timetable-grid`, `.timetable-cell`, `.timetable-header`, `.timetable-slot` |

### 6.2 Styling Inconsistency Problem

The project uses **three different styling methods** simultaneously:

| Method | Usage | Pages Affected |
|--------|-------|---------------|
| **CSS component classes** (`.btn-primary`, `.card`) | ~45% of styles | Loading, Modal, Toast, partial Sidebar |
| **Tailwind utility classes** (`flex`, `gap-4`, `text-sm`) | ~10% of styles | SettingsPage primarily, scattered |
| **Inline CSS objects** (`style={{...}}`) | ~45% of styles | AppLayout, Sidebar, DataTable, BulkImportModal, most pages |

### 6.3 Styling Issues

| Issue | Impact | Location |
|-------|--------|----------|
| **SettingsPage ignores design system** | Visual inconsistency | SettingsPage uses pure Tailwind, no CSS variables |
| **Hardcoded hex colors** | Breaks theme switching | `#3b82f6` in DataTable sort, Select, Sidebar logo |
| **Massive inline styles** | Maintenance burden, perf hit | TimetablePage (~200+ inline objects), BulkImportModal |
| **Dead `App.css`** | Confusion | Vite boilerplate never cleaned up |
| **Generic HTML title** | Unprofessional | `<title>frontend</title>` in index.html |
| **Default favicon** | Unprofessional | Still using `vite.svg` |

---

## 7. Data Flow & State Management

### 7.1 State Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Global State (Context)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Theme    │  │ Auth     │  │ Toast    │              │
│  │ (light/  │  │ (user,   │  │ (toasts, │              │
│  │  dark)   │  │  token)  │  │  add,    │              │
│  └──────────┘  └──────────┘  │  dismiss)│              │
│                               └──────────┘              │
├──────────────────────────────────────────────────────────┤
│                    Local State (useState)                 │
│  Per page: loading, error, data, modalState, form        │
│  No global state manager (no Redux/Zustand/Jotai)        │
├──────────────────────────────────────────────────────────┤
│                    Server State (API)                     │
│  No caching layer (no React Query/SWR)                   │
│  Every mount = fresh fetch                               │
│  useTable = client-side pagination on top of server data  │
└──────────────────────────────────────────────────────────┘
```

### 7.2 Data Fetching Pattern

All CRUD pages follow an identical pattern:

```typescript
// 1. State declaration
const [data, setData] = useState<T[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [saving, setSaving] = useState(false);
const [modalState, setModalState] = useState<ModalState>({});

// 2. Load function
const load = async () => {
  try {
    setLoading(true);
    setError('');
    const res = await xxxService.list();
    setData(res.data);
  } catch (err) {
    setError(getErrorMessage(err));
  } finally {
    setLoading(false);
  }
};

// 3. Effect trigger
useEffect(() => { load(); }, []);

// 4. Mutation handler (create/update/delete)
const handleSave = async (formData: Payload) => {
  try {
    setSaving(true);
    if (modalState.mode === 'create') {
      await xxxService.create(formData);
    } else {
      await xxxService.update(modalState.data.id, formData);
    }
    toast('success', 'Saved successfully');
    setModalState({ isOpen: false });
    await load(); // Full refetch
  } catch (err) {
    toast('error', getErrorMessage(err));
  } finally {
    setSaving(false);
  }
};
```

**Duplication:** This exact pattern is repeated across all 8 CRUD pages (~500+ duplicated lines).

### 7.3 Form Handling

| Tool | Purpose | Quality |
|------|---------|---------|
| `react-hook-form` | Form state management | ✅ Excellent |
| `zod` | Schema validation | ✅ Excellent |
| `@hookform/resolvers/zod` | Bridge library | ⚠️ Requires `as any` cast |
| `setValue()` / `reset()` | Edit mode population | ✅ Consistent |

**Issue:** Every form submit handler uses `as any` cast:
```typescript
handleSubmit(onSubmit as any) // ~8 occurrences
```
This suggests a type compatibility issue between `zodResolver` and the form's field values type.

---

## 8. Page-by-Page Analysis

### 8.1 CRUD Pages (8 pages, 60–70% identical)

| Page | LOC | State Vars | Functions | Unique Features |
|------|-----|-----------|-----------|----------------|
| DepartmentsPage | 225 | 6 | 4 | Basic CRUD |
| ProgramsPage | 223 | 6 | 4 | Department dropdown |
| SectionsPage | 237 | 6 | 4 | Batch/program dropdowns |
| CoursesPage | 277 | 7 | 5 | Department filter |
| RoomsPage | 340 | 7 | 6 | Lab↔Program validation |
| BatchesPage | 502 | 16 | 10 | Tab view (list/sections) |
| TeachersPage | 534 | 10 | 8 | Availability grid |
| WorkloadPage | 457 | 7 | 5 | Two-mode mapping |

### 8.2 Feature Pages

#### DashboardPage (394 lines)
- **Strengths:** Recharts integration, responsive grid, skeleton loading
- **Weaknesses:** Hardcoded activity feed (fake data), static quick actions
- **Score:** B

#### TimetablePage (2,437 lines) ⚠️
- **Strengths:** WebSocket real-time generation, batch grid view, readiness checks, CSV export
- **Weaknesses:**
  - Monolithic — should be 6–8 separate components
  - Dead DnD imports (`useDraggable`, `useDroppable`, `GripVertical`)
  - Unused states (`viewType`, `filterType`, `filterId`, `resolutionModalOpen`)
  - Hardcoded DAYS/SLOTS instead of using Settings
  - `window.confirm()` instead of `ConfirmModal`
  - CSV export doesn't quote fields with commas
  - Massive inline styles (~200+ objects)
- **Score:** C-

#### SettingsPage (814 lines)
- **Strengths:** Tab-based config, live preview, responsive grid
- **Weaknesses:**
  - Uses raw `useState` instead of `react-hook-form` (inconsistent)
  - `JSON.stringify` for change detection (fragile, expensive)
  - Uses pure Tailwind classes (ignores the CSS variable design system)
  - `window.confirm()` instead of `ConfirmModal`
- **Score:** C+

#### LoginPage / RegisterPage (385 lines combined)
- **Strengths:** Clean form handling, split-panel layout, loading states
- **Weaknesses:** Left panel hidden on mobile (reduces branding presence)
- **Score:** B+

---

## 9. Service Layer & API Integration

### 9.1 Service Architecture

```
Pages → Service Objects → Axios Instance → Vite Proxy → Flask Backend
```

### 9.2 Service Inventory

| Service | Endpoints | Typed? | Error Handling |
|---------|-----------|--------|---------------|
| `authService` | 7 | ✅ Full | ❌ None |
| `curriculumService` | 14 | ⚠️ Own types (conflict with shared) | ❌ None |
| `resourcesService` (×6) | 32+ | ✅ Full | ❌ None |
| `schedulingService` | 7 | ✅ Full | ❌ None |
| `settingsService` | 4 | ✅ Full | ❌ None |

### 9.3 Critical Service Issues

#### Issue 1: Massive Code Duplication in Resources

All 6 resource services follow an identical pattern (~160 lines duplicated):
```typescript
const xxxService = {
  list:    (params?) => api.get('/xxx', { params }),
  get:     (id)      => api.get(`/xxx/${id}`),
  create:  (payload) => api.post('/xxx', payload),
  update:  (id, p)   => api.put(`/xxx/${id}`, p),
  delete:  (id)      => api.delete(`/xxx/${id}`),
  bulkImport: (file) => { /* FormData POST — copy-pasted 7 times */ },
};
```

**Fix:** Generic factory function `createCrudService<T>(basePath)`.

#### Issue 2: Zero Error Handling

Every service method is a bare `await api.xxx()` with no try/catch. All error handling is pushed to consumers, resulting in:
- Inconsistent error messages across pages
- No centralized error normalization
- No retry logic for transient failures

#### Issue 3: Type Conflicts in curriculum.service.ts

Defines its own `Program`, `Course`, `Batch` interfaces that **conflict** with shared types in `@/types/index.ts`:

| Type | `curriculum.service.ts` | `@/types/index.ts` |
|------|------------------------|--------------------|
| `Program` | `department?: string` | `program_code?: string` |
| `Course` | `course_type, credits` | `semester, course_type, department_code` |
| `Batch` | `program?: { id, code, name }` | `code, program_code?, section_count?` |

#### Issue 4: Inconsistent API Response Shapes

| Endpoint Pattern | Response Shape | Example |
|-----------------|---------------|---------|
| Auth | Flat | `{ access_token, refresh_token, user }` |
| Curriculum list | Wrapped array | `{ programs: [...] }` |
| Resources list | Paginated | `{ data: [...], meta: { page, per_page, total } }` |
| Timetable | Mixed | `{ data: [...], breaks, time_slots }` |

No standardized envelope — consumers must know each endpoint's specific shape.

### 9.4 Axios Configuration

| Feature | Implementation | Quality |
|---------|---------------|---------|
| Base URL | `/api` (proxied) | ✅ |
| JWT injection | Request interceptor | ✅ |
| Auto refresh | 401 → refresh → retry | ✅ |
| Refresh dedup | Singleton `refreshPromise` | ✅ Excellent |
| Refresh failure | Clear tokens + redirect | ⚠️ Hard redirect |
| Timeout | Not configured | ❌ Missing |
| Request cancellation | Not configured | ❌ Missing |

---

## 10. Accessibility Audit

### 10.1 WCAG 2.1 Compliance Score: **3.5/10 (F)**

| Criterion | Status | Details |
|-----------|--------|---------|
| **Keyboard Navigation** | ❌ FAIL | No Escape key in modals, no arrow keys in Select, no focus trapping |
| **ARIA Roles** | ❌ FAIL | Missing `role="dialog"`, `role="listbox"`, `aria-expanded`, `aria-sort` |
| **Focus Management** | ❌ FAIL | No focus trap in modals, no focus return on close |
| **Semantic HTML** | ✅ PASS | Correct use of `<nav>`, `<main>`, `<header>`, `<table>`, `<form>` |
| **Color Contrast** | ⚠️ PARTIAL | Good token system, but some muted text elements are low-contrast |
| **Screen Readers** | ⚠️ PARTIAL | Toasts have `role="alert"`, spinner has `role="status"`, but many gaps |
| **Form Labels** | ⚠️ PARTIAL | Auth pages link labels via `htmlFor`; CRUD modals mostly missing |
| **Icon Buttons** | ❌ FAIL | Most edit/delete icon buttons in DataTable have no `aria-label` |

### 10.2 Critical Accessibility Failures

| Component | Missing A11y |
|-----------|-------------|
| **Modal** | `role="dialog"`, `aria-modal`, focus trap, Escape, scroll lock |
| **Select** | `role="listbox"`, `role="option"`, `aria-expanded`, keyboard nav |
| **DataTable** | `aria-sort` on headers, `aria-label` on search, `aria-label` on pagination |
| **Sidebar** | `aria-label` on `<nav>`, `aria-current="page"` on active items |
| **BulkImportModal** | Keyboard-triggerable upload zone, `tabIndex`, `onKeyDown` |
| **Header Dropdown** | Escape key close, focus trap, `aria-expanded` |
| **Timetable Grid** | Proper cell labeling, `aria-describedby` for cell content |
| **Teacher Availability** | `role="checkbox"`, `aria-pressed` on toggle buttons |

---

## 11. Performance Analysis

### 11.1 Performance Concerns

| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| **No data caching** | 🔴 High | Re-fetch on every navigation | All pages |
| **Full dataset loading** | 🔴 High | Loads 200–2000 records at once | All CRUD pages |
| **Inline style objects** | 🟡 Medium | New object allocation every render | TimetablePage, Dashboard, BulkImportModal |
| **No memoization** | 🟡 Medium | Lookup maps re-computed per render | Several pages |
| **JSON.stringify change detection** | 🟡 Medium | Expensive string comparison | SettingsPage |
| **Dead DnD imports** | 🟢 Low | Unnecessary bundle size | TimetablePage (~6 packages) |
| **No image optimization** | 🟢 Low | Static SVGs only (minimal impact) | All pages |

### 11.2 Bundle Size Concerns

Unused dependencies adding to bundle:
- `@dnd-kit/core` + `@dnd-kit/modifiers` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (~50KB gzipped)
- `@radix-ui/react-dialog` + `@radix-ui/react-select` + `@radix-ui/react-tabs` + `@radix-ui/react-switch` (installed but unused)

---

## 12. Security Analysis

### 12.1 Security Concerns

| Issue | Severity | Description |
|-------|----------|-------------|
| **JWT in localStorage** | 🔴 High | Vulnerable to XSS — any injected script can steal tokens |
| **No CSP headers** | 🟡 Medium | No Content Security Policy to mitigate XSS |
| **No input sanitization** | 🟡 Medium | Relies entirely on Zod validation (backend should also sanitize) |
| **Axios↔Auth disconnect** | 🟡 Medium | Force logout bypasses React state, potentially exposing stale UI |
| **No CSRF protection** | 🟢 Low | JWT Bearer tokens are inherently CSRF-resistant |

### 12.2 Recommendations

1. **Move to `HttpOnly` cookies** for JWT storage
2. **Add CSP headers** in Vite config or reverse proxy
3. **Fix Auth↔Axios disconnect** with event-based communication
4. **Add request timeout** (30s default) to prevent hanging requests

---

## 13. Code Quality Metrics

### 13.1 Per-File Metrics

| File | LOC | Complexity | TypeScript | A11y | Styling | Score |
|------|-----|-----------|-----------|------|---------|-------|
| DashboardPage | 394 | Low | A- | C | C | B |
| TimetablePage | 2,437 | Very High | C | D | D | C- |
| TeachersPage | 534 | Medium | C+ | D+ | C | C+ |
| CoursesPage | 277 | Low | C+ | D+ | C | B- |
| RoomsPage | 340 | Low-Med | C+ | D+ | C | B- |
| SectionsPage | 237 | Low | C+ | D+ | C | B- |
| BatchesPage | 502 | Medium | C+ | D+ | C | C+ |
| DepartmentsPage | 225 | Low | C+ | D+ | C | B |
| ProgramsPage | 223 | Low | C | D+ | C | B- |
| WorkloadPage | 457 | Medium | C+ | D+ | C | C+ |
| SettingsPage | 814 | Med-High | B | C | D | C+ |
| LoginPage | 239 | Low | A- | B | B+ | B+ |
| RegisterPage | 146 | Low | A- | B | B+ | B+ |

### 13.2 Type Safety Issues

- **~40+ `as any` casts** across pages — primarily in form submit handlers
- **`as unknown as T`** casts for DataTable row data
- **`ModalState.data: unknown`** — loses type safety in modal interactions
- **`Availability: Record<string, string[]>`** — too loosely typed (should constrain day keys)

### 13.3 Dead Code Inventory

| Item | Location | Action |
|------|----------|--------|
| `App.css` | Root | Delete |
| DnD imports (6 packages) | TimetablePage | Remove or implement |
| `viewType` state | TimetablePage | Remove unused 'Grid'/'List' variants |
| `filterType` / `filterId` states | TimetablePage | Remove |
| `resolutionModalOpen` / `suggestingEntry` | TimetablePage | Remove or implement |
| `watch` import | ProgramsPage | Remove unused import |
| `useRef` import (GripVertical) | TimetablePage | Remove if unused |

---

## 14. Critical Issues (Must Fix)

### 🔴 P0 — Blocking Production

| # | Issue | Impact | Effort | File(s) |
|---|-------|--------|--------|---------|
| 1 | **Modal has no focus trap or Escape key** | WCAG 2.1 Level A failure; keyboard users trapped | 2h | `Modal.tsx` |
| 2 | **Custom Select is completely inaccessible** | Screen readers cannot use it at all | 2h | `Select.tsx` |
| 3 | **Auth↔Axios disconnect on force logout** | Stale auth state, security risk | 1h | `axios.ts`, `AuthContext.tsx` |
| 4 | **JWT in localStorage (XSS vulnerable)** | Token theft via injected script | 4h | `axios.ts`, backend |

### 🟠 P1 — High Priority

| # | Issue | Impact | Effort | File(s) |
|---|-------|--------|--------|---------|
| 5 | **No data caching layer** | Loading spinners everywhere, wasted bandwidth | 8h | All pages |
| 6 | **CRUD page duplication (60–70%)** | Maintenance burden, bug propagation | 6h | 8 CRUD pages |
| 7 | **TimetablePage monolith (2,437 lines)** | Unmaintainable, hard to test | 8h | `TimetablePage.tsx` |
| 8 | **Service layer duplication** | ~160 lines copy-pasted | 2h | `resources.service.ts` |
| 9 | **Icon buttons lack aria-labels** | Screen readers cannot identify actions | 2h | All DataTable usages |
| 10 | **Pervasive `as any` casts** | Defeats TypeScript safety | 4h | All form pages |

### 🟡 P2 — Medium Priority

| # | Issue | Impact | Effort | File(s) |
|---|-------|--------|--------|---------|
| 11 | **Inconsistent styling (3 methods)** | Maintenance burden, visual inconsistency | 6h | Most pages |
| 12 | **Hardcoded colors break themes** | Visual bugs in dark mode | 2h | DataTable, Select, Sidebar |
| 13 | **Dead code (DnD imports, App.css)** | Confusion, bundle bloat | 1h | TimetablePage, root |
| 14 | **No server-side pagination** | Breaks with large datasets | 4h | All CRUD pages |
| 15 | **useTable numeric sort broken** | Incorrect ordering for numbers | 1h | `useTable.ts` |
| 16 | **Duplicate click-outside handler** | Code smell | 0.5h | Sidebar, Select |
| 17 | **Sidebar/Header in same file** | Naming violation | 0.5h | `Sidebar.tsx` |
| 18 | **SettingsPage ignores design system** | Visual inconsistency | 3h | `SettingsPage.tsx` |
| 19 | **Type conflicts in curriculum.service.ts** | Type confusion | 1h | `curriculum.service.ts` |
| 20 | **Inconsistent confirm dialogs** | `window.confirm()` vs `ConfirmModal` | 1h | Timetable, Workload, Settings |

---

## 15. Improvement Roadmap

### Phase 1: Foundation Fixes (Week 1–2)

> Goal: Fix blocking issues and eliminate worst anti-patterns

#### 1.1 Accessibility Quick Wins
- [ ] Replace custom `Modal` with `@radix-ui/react-dialog` (already installed)
- [ ] Replace custom `Select` with `@radix-ui/react-select` (already installed)
- [ ] Add `aria-label` to all icon-only buttons in DataTable action columns
- [ ] Add `aria-sort` to DataTable sortable headers
- [ ] Add `aria-label` to search input and pagination buttons

#### 1.2 Security & Auth Fixes
- [ ] Fix Auth↔Axios disconnect: use custom event or registered callback
- [ ] Add Axios request timeout (30s default)
- [ ] Type the `_retry` flag via Axios module augmentation

#### 1.3 Dead Code Cleanup
- [ ] Delete `App.css`
- [ ] Remove unused DnD imports from TimetablePage (or implement DnD)
- [ ] Remove unused states (`viewType`, `filterType`, `filterId`)
- [ ] Remove unused `watch` import from ProgramsPage
- [ ] Update `index.html` title and favicon

### Phase 2: Architecture Improvements (Week 3–5)

> Goal: Eliminate duplication, improve maintainability

#### 2.1 Extract Shared CRUD Abstractions
```typescript
// Proposed: useCrudPage<T, Payload> hook
function useCrudPage<T extends { id: number }, P>(
  service: CrudService<T, P>,
  options?: CrudPageOptions
) {
  // Handles: loading, error, saving, data, modalState
  // Provides: load(), handleSave(), handleDelete(), openCreate(), openEdit()
  return { data, loading, error, saving, modalState, handlers };
}
```
- [ ] Implement `useCrudPage` hook
- [ ] Refactor all 8 CRUD pages to use the hook
- [ ] Extract `CrudPageLayout` component (header + table + modals)

#### 2.2 Service Layer Deduplication
```typescript
// Proposed: createCrudService factory
function createCrudService<T, P>(basePath: string) {
  return {
    list: (params?) => api.get<PaginatedResponse<T>>(basePath, { params }),
    get: (id: number) => api.get<T>(`${basePath}/${id}`),
    create: (payload: P) => api.post<T>(basePath, payload),
    update: (id: number, payload: P) => api.put<T>(`${basePath}/${id}`, payload),
    delete: (id: number) => api.delete(`${basePath}/${id}`),
    bulkImport: (file: File) => { /* FormData POST */ },
  };
}
```
- [ ] Implement `createCrudService` factory
- [ ] Refactor 6 resource services to use factory
- [ ] Reconcile type conflicts in `curriculum.service.ts`

#### 2.3 Break Down TimetablePage
Split `TimetablePage.tsx` (2,437 lines) into:
- [ ] `components/timetable/TimetableToolbar.tsx` — Department/program selectors, action buttons
- [ ] `components/timetable/BatchTimetableView.tsx` — Grid rendering (~800 lines)
- [ ] `components/timetable/GenerationPanel.tsx` — AI generation with WebSocket
- [ ] `components/timetable/ReadinessChecker.tsx` — Pre-generation validation
- [ ] `components/timetable/ManualEntryModal.tsx` — Add/edit timetable entries
- [ ] `components/timetable/TimetableStats.tsx` — Generation statistics
- [ ] `hooks/useTimetableGeneration.ts` — WebSocket + generation state

#### 2.4 Shared Utility Hooks
- [ ] `useClickOutside(ref, handler)` — Extract from Header and Select
- [ ] `useDropdown()` — Encapsulate open/close, click-outside, keyboard handling
- [ ] `useConfirmDialog()` — Replace all `window.confirm()` with `ConfirmModal`

### Phase 3: Data Layer Modernization (Week 5–7)

> Goal: Add caching, improve performance, fix TypeScript

#### 3.1 Introduce React Query (TanStack Query)
- [ ] Install and configure `@tanstack/react-query`
- [ ] Create query hooks for each service: `useDepartments()`, `useTeachers()`, etc.
- [ ] Replace all `useEffect + load()` patterns with query hooks
- [ ] Enable stale-while-revalidate for reference data
- [ ] Add optimistic updates for create/update/delete mutations

#### 3.2 Fix TypeScript Safety
- [ ] Investigate and fix `zodResolver` type issue causing `as any` casts
- [ ] Make `ModalState` generic: `ModalState<T> { data?: T }`
- [ ] Tighten `Availability` type to use `DayOfWeek` keys
- [ ] Enable `noUnusedLocals: true` in `tsconfig.app.json`

#### 3.3 Server-Side Pagination
- [ ] Configure backend to support proper pagination params
- [ ] Update `useTable` to work with server pagination
- [ ] Remove `perPage: 2000` workarounds
- [ ] Add debounce to search input (300ms)

### Phase 4: Styling Unification (Week 7–9)

> Goal: Single styling approach, consistent theming

#### 4.1 Choose Primary Styling Method
**Recommendation:** Tailwind CSS utility classes as primary, with CSS component classes for complex composites.

- [ ] Convert all inline `style={{}}` to Tailwind classes or CSS variables
- [ ] Refactor `SettingsPage` to use CSS variable system (or Tailwind with theme tokens)
- [ ] Replace all hardcoded hex colors with CSS variables or Tailwind theme tokens
- [ ] Use `class-variance-authority` (already installed) for button/form variants

#### 4.2 Component Library Enhancement
- [ ] Create Tailwind-based `Button` component using CVA
- [ ] Create `Input`, `Label`, `FormGroup` components
- [ ] Create `Badge` component with variant support
- [ ] Create `Card` component with `elevated` variant
- [ ] Create `PageHeader` component (standardize page titles)

### Phase 5: Polish & Optimization (Week 9–10)

> Goal: Production-ready quality

#### 5.1 Performance Optimization
- [ ] Remove unused dependencies from `package.json`
- [ ] Add `React.memo` to pure render components
- [ ] Memoize expensive computations in TimetablePage
- [ ] Implement route-based code splitting (`React.lazy`)
- [ ] Add image/assets optimization

#### 5.2 UX Enhancements
- [ ] Replace hardcoded Dashboard activity feed with real data
- [ ] Add breadcrumbs navigation
- [ ] Add global search functionality
- [ ] Implement responsive table view for mobile (card layout)
- [ ] Add row selection and bulk actions to DataTable

#### 5.3 Testing Foundation
- [ ] Set up Vitest + React Testing Library
- [ ] Add tests for shared hooks (`useCrudPage`, `useTable`, `useClickOutside`)
- [ ] Add tests for utility functions
- [ ] Add E2E tests for critical flows (login, CRUD, schedule generation)

---

## Appendix A: Recommended Tech Additions

| Package | Purpose | Priority |
|---------|---------|----------|
| `@tanstack/react-query` | Server state management, caching, deduplication | 🔴 P1 |
| `react-focus-lock` | Focus trapping for modals (if not using Radix) | 🔴 P0 |
| `@radix-ui/react-dialog` | Accessible modal (already installed, unused) | 🔴 P0 |
| `@radix-ui/react-select` | Accessible select (already installed, unused) | 🔴 P0 |
| `nuqs` or `next/navigation` | URL search params for filters (future Next.js migration) | 🟡 P2 |

## Appendix B: File Rename Suggestions

| Current | Proposed | Reason |
|---------|----------|--------|
| `Sidebar.tsx` | `Sidebar.tsx` + `Header.tsx` | Single Responsibility |
| `App.css` | *(delete)* | Dead code |
| `BulkImportModal.tsx` | Keep, but reduce inline styles | Maintenance |
| `TimetablePage.tsx` | `pages/TimetablePage.tsx` + 6 component files | Monolith |

---

*This analysis is based on the source code snapshot of AIPCSS-main. All recommendations are prioritized by impact and effort. The roadmap assumes a team of 1–2 frontend developers working over 10 weeks.*
