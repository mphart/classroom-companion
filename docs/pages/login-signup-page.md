# Login & Signup Pages — Product Specification

## Overview

The Login and Signup pages are the entry points to the app. They share the same split-screen layout philosophy — logo-forward on the left, form on the right — and are deliberately minimal. No distractions, no social logins, no extra fields. Just what is needed to get the user in or create their account.

---

## Shared Layout — Split Screen

Both pages use the same two-column layout:

- **Left half:** The app logo and brand identity. This side is purely visual — it communicates who we are before the user types a single character.
- **Right half:** The form. Clean, centered vertically within its column, with generous whitespace around it.

This layout is desktop-first. On mobile, the logo panel collapses and the form takes the full screen.

---

## Left Panel — Logo & Brand

### Purpose
To make a strong first impression. The logo side should feel premium and memorable — not just a placeholder. The user should feel like they're entering something worth their time.

### What appears here
- The app logo, large and centered.
- Optionally, the app name in a stylized typographic treatment beneath the logo mark.
- The background of this panel is visually distinct — a rich color, a subtle texture, or a dark tone that contrasts with the white form panel on the right. It should feel designed, not default.

### Design notes
- The logo should be the clear focal point — given room to breathe with generous padding around it.
- No body copy, no taglines, no marketing text on this panel. The logo speaks for itself.
- This panel is static — it does not change between the Login and Signup pages.

---

## Right Panel — Form Area

The form is centered vertically and horizontally within the right panel. It is not full-width — it sits comfortably in the middle with clear margins on both sides, keeping it compact and focused.

---

## Login Page

### Heading
A short, warm welcome at the top of the form. Something like:

> **Welcome back.**

Subtext beneath it, very light:

> Sign in to your account.

### Form Fields

**Username**
- Label: `Username`
- Input: standard text field
- Placeholder: subtle hint text (e.g., `Enter your username`)

**Password**
- Label: `Password`
- Input: password field (characters hidden by default)
- Placeholder: `Enter your password`

### Primary Action
A single, full-width login button below the fields.

- Label: `Log In`
- Style: solid, uses the app's primary accent color, clearly the main CTA on the page.

### Secondary Link
Below the button, a line of small text:

> Don't have an account? **Sign up**

"Sign up" is a clickable link that navigates to the Signup page.

### What is NOT on this page
- No "Forgot password?" link *(can be added later)*
- No social login buttons (Google, Apple, etc.)
- No remember me checkbox
- No extra copy or marketing

---

## Signup Page

### Heading
Short and welcoming:

> **Create your account.**

Subtext:

> It only takes a moment.

### Form Fields

**Name**
- Label: `Name`
- Input: standard text field
- Placeholder: `Enter your full name`

**Username**
- Label: `Username`
- Input: standard text field
- Placeholder: `Choose a username`

**Password**
- Label: `Password`
- Input: password field
- Placeholder: `Create a password`

Fields appear in this order: Name → Username → Password.

### Primary Action
A single, full-width submit button.

- Label: `Create Account`
- Same styling as the Login button — solid, primary accent color.

### Secondary Link
Below the button:

> Already have an account? **Log in**

"Log in" navigates back to the Login page.

### What is NOT on this page
- No confirm password field *(keep it minimal; validation can catch issues)*
- No email field *(username-based auth only)*
- No terms of service checkbox *(can be added later)*
- No profile photo upload

---

## Interaction & Validation

- Fields should show a clear visual error state (e.g., red border + inline message) if the user submits with empty fields or invalid credentials.
- Error messages appear inline beneath the relevant field — not as a popup or toast.
- The login button should show a subtle loading state (e.g., spinner) while the request is processing, preventing double-submits.
- On successful login or signup, the user is routed to the Home page of the app.

---

## Design Principles

- **Split-screen, two worlds.** The left is brand. The right is function. They complement each other — one visually rich, one clean and purposeful.
- **The logo earns its space.** The left panel exists to make the logo feel important. It should not look like an afterthought.
- **The form is effortless.** As few fields as possible. Clear labels. Obvious action. No friction.
- **Consistency between Login and Signup.** Both pages feel like the same place. Same layout, same font, same button style. Only the heading, fields, and secondary link change.
- **White space is intentional.** The right panel should never feel crowded. The form floats in the center with room around it.