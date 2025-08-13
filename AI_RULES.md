# AI Development Rules

This document outlines the tech stack and coding conventions for this HelioScope clone application. Following these rules ensures consistency and maintainability.

## Tech Stack

- **Framework:** React with TypeScript for building a type-safe user interface.
- **Build Tool:** Vite for fast development and optimized builds.
- **Styling:** Tailwind CSS for all styling. No other CSS-in-JS libraries or plain CSS files should be used for component styling.
- **Mapping:** `react-leaflet` and `leaflet` are used for interactive maps. Geocoding is handled by the OpenStreetMap Nominatim API for development.
- **Icons:** `lucide-react` is the designated library for all icons.
- **State Management:** Local component state is managed with React Hooks (`useState`, `useEffect`). Global state is not yet managed by a specific library.
- **Routing:** View navigation is currently handled by conditional rendering within `App.tsx`.

## Library Usage Rules

- **Styling:**
  - **ALWAYS** use Tailwind CSS utility classes for styling.
  - Create reusable components in the `src/components` directory.
  - Do not write custom CSS files for components. `src/index.css` is for base Tailwind directives only.

- **Components:**
  - **ALWAYS** create new components in separate files under `src/components`.
  - Keep components small and focused on a single responsibility.
  - Use the existing form components (`FormField.tsx`, `SelectField.tsx`, `TextAreaField.tsx`) for all forms to maintain consistency.

- **Icons:**
  - **ONLY** use icons from the `lucide-react` library.
  - Import icons directly, e.g., `import { Sun } from 'lucide-react';`.

- **Maps:**
  - All map functionality **MUST** be implemented using `react-leaflet`.
  - The `src/utils/geocoding.ts` file contains helpers for address lookups. Use these functions for any geocoding needs.

- **State Management:**
  - For simple, local state, use `useState` and `useReducer`.
  - For state that needs to be shared across a few nested components, use `useContext`.
  - If complex global state management is required, a dedicated library like Zustand should be considered and added as a dependency.

- **Routing:**
  - For any new pages or complex navigation, `react-router-dom` should be installed and used to manage routes in `src/App.tsx`. Do not add more conditional rendering logic for navigation.

- **Types:**
  - Define all shared types in `src/types/project.ts` or create new files in `src/types` as needed.
  - Avoid using `any` whenever possible.