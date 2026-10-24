// Offline-only, minimal React typings so `npm run typecheck:offline` can check app logic without
// @types/react installed. After `npm install`, use `npm run typecheck` (real React types).
declare namespace React {
  type ReactNode = any; type CSSProperties = Record<string, any>; type FormEvent<T = any> = any;
  interface Context<T> { Provider: any; Consumer: any; _t?: T }
  function useState<T>(init: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void];
  function useEffect(fn: () => any, deps?: any[]): void;
  function useMemo<T>(fn: () => T, deps: any[]): T;
  function useRef<T>(init: T): { current: T };
  function useCallback<T>(fn: T, deps: any[]): T;
  function createContext<T>(d: T): Context<T>;
  function useContext<T>(c: Context<T>): T;
}
declare module 'react' { export = React; }
declare module 'react-dom/client' { export const createRoot: any; }
declare module 'react/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare module 'jszip' { const JSZip: any; export default JSZip; }
declare module '*.css' { const s: string; export default s; }
declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface Element { } interface IntrinsicAttributes { key?: any } interface ElementChildrenAttribute { children: {} } }
declare module 'node:test' { export const test: any; }
declare module 'node:assert/strict' { const assert: any; export default assert; }
