---
description: Plan and implement UI — unified design pipeline with automated design system generation
---

# /ui-ux-pro-max — Unified Design Pipeline

> Combines **ui-ux-pro-max** (data engine) + **frontend-design** (principles) + **web-design-guidelines** (audit) into one workflow.

## Prerequisites

```bash
python3 --version || python --version
```

If Python is not installed:
- **macOS:** `brew install python3`
- **Ubuntu/Debian:** `sudo apt update && sudo apt install python3`

---

## Workflow Pipeline

```
┌─────────────────────────┐
│  STEP 1: ANALYZE        │  ← Extract product type, style, industry, stack
├─────────────────────────┤
│  STEP 2: DESIGN SYSTEM  │  ← ui-ux-pro-max Python search engine
├─────────────────────────┤
│  STEP 3: APPLY THINKING │  ← frontend-design principles (UX psychology)
├─────────────────────────┤
│  STEP 4: IMPLEMENT CODE │  ← Build with stack guidelines
├─────────────────────────┤
│  STEP 5: AUDIT          │  ← web-design-guidelines compliance check
└─────────────────────────┘
```

---

## Step 1: Analyze User Requirements

Extract from user request:
- **Product type**: SaaS, e-commerce, portfolio, dashboard, landing page
- **Style keywords**: minimal, playful, professional, elegant, dark mode
- **Industry**: healthcare, fintech, gaming, education
- **Stack**: React, Vue, Next.js, or default to `html-tailwind`

---

## Step 2: Generate Design System (REQUIRED)

**Always start with `--design-system`** to get comprehensive recommendations:

```bash
python3 .agent/.shared/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

This searches 5 domains in parallel, applies 161 reasoning rules, and returns:
- Pattern, style, colors, typography, effects
- Anti-patterns to avoid

**Example:**
```bash
python3 .agent/.shared/ui-ux-pro-max/scripts/search.py "data dashboard analytics internal" --design-system -p "Omniverse"
```

### Persist Design System (Optional)

```bash
python3 .agent/.shared/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"
```

Creates `design-system/MASTER.md` + `design-system/pages/` for hierarchical overrides.

### Supplement with Domain Searches

```bash
python3 .agent/.shared/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

| Need | Domain | Example |
|------|--------|---------|
| Style options | `style` | `--domain style "glassmorphism dark"` |
| Chart types | `chart` | `--domain chart "real-time dashboard"` |
| UX practices | `ux` | `--domain ux "animation accessibility"` |
| Font options | `typography` | `--domain typography "elegant luxury"` |
| Landing structure | `landing` | `--domain landing "hero social-proof"` |

### Stack Guidelines

```bash
python3 .agent/.shared/ui-ux-pro-max/scripts/search.py "<keyword>" --stack react
```

Available stacks: `html-tailwind`, `react`, `nextjs`, `vue`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`

---

## Step 3: Apply Design Thinking

Read and apply **`@skills/frontend-design`** principles:

1. **UX Psychology** — Hick's Law, Fitts' Law, Von Restorff (REQUIRED: `ux-psychology.md`)
2. **Color Principles** — 60-30-10 rule, color psychology
3. **Layout Principles** — Golden ratio, 8-point grid
4. **Anti-patterns** — Purple ban, bento grid cliché, mesh gradients

> 🔴 **Merge ui-ux-pro-max recommendations WITH frontend-design principles.** The data engine gives you WHAT, the principles tell you WHY.

---

## Step 4: Implement Code

Using the design system + principles:
1. Build components with recommended styles/colors/typography
2. Apply stack-specific best practices
3. Follow `@skills/clean-code` rules

---

## Step 5: Audit (Pre-Delivery)

Run **`@skills/web-design-guidelines`** compliance check:

### Visual Quality
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] Brand logos correct (Simple Icons)
- [ ] Hover states don't shift layout
- [ ] All clickable elements have `cursor-pointer`

### Light/Dark Mode
- [ ] Text contrast ≥ 4.5:1
- [ ] Glass elements visible in light mode
- [ ] Borders visible in both modes

### Layout & Responsiveness
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile
- [ ] No content hidden behind fixed navbars

### Accessibility
- [ ] Images have alt text
- [ ] Form inputs have labels
- [ ] `prefers-reduced-motion` respected

---

## Quick Reference

### Available Domains
| Domain | Keywords |
|--------|----------|
| `product` | SaaS, e-commerce, portfolio, healthcare |
| `style` | glassmorphism, minimalism, dark mode |
| `typography` | elegant, playful, professional |
| `color` | saas, ecommerce, healthcare, fintech |
| `landing` | hero, testimonial, pricing |
| `chart` | trend, comparison, timeline, funnel |
| `ux` | animation, accessibility, z-index |
| `react` | waterfall, bundle, suspense, memo |
| `web` | aria, focus, keyboard, semantic |

### Output Formats
```bash
# ASCII (default, for terminal)
python3 .agent/.shared/ui-ux-pro-max/scripts/search.py "fintech" --design-system

# Markdown (for documentation)
python3 .agent/.shared/ui-ux-pro-max/scripts/search.py "fintech" --design-system -f markdown
```