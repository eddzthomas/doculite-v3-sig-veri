# Design System and Accessibility

**Status:** Draft for approval  
**Owner:** Design Lead

## Component expectations

Use a consistent application shell, data table, filter control, upload drop zone, document preview, status badge, timeline, confirmation dialog, toast, error summary, and evidence panel. Components must expose loading, empty, error, disabled, and success states.

## Accessibility target

V1 targets WCAG 2.2 AA for product-owned screens. Support keyboard operation, visible focus, semantic headings, labelled controls, screen-reader announcements for asynchronous state changes, error summaries, sufficient contrast, responsive reflow, and text alternatives for visual status indicators.

## Status presentation

Every status has a text label and icon/pattern in addition to color. Verification reports use a semantic definition list or table, not an image. Long certificate values support copying and wrap safely; document content is never duplicated into decorative labels.

## Responsive behavior

At narrow widths, filters and metadata collapse into drawers or sections; primary actions remain visible; tables offer an accessible card/list alternative. The document preview never blocks access to metadata or verification information.

