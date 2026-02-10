declare module 'semver' {
  export function satisfies(version: string, range: string, optionsOrLoose?: any): boolean;
  export function valid(version: string, optionsOrLoose?: any): string | null;
  export function clean(version: string, optionsOrLoose?: any): string | null;
  export function coerce(version: string, optionsOrLoose?: any): any | null;
  export function gte(v1: string, v2: string, optionsOrLoose?: any): boolean;
  export function lte(v1: string, v2: string, optionsOrLoose?: any): boolean;
  export function gt(v1: string, v2: string, optionsOrLoose?: any): boolean;
  export function lt(v1: string, v2: string, optionsOrLoose?: any): boolean;
  export function eq(v1: string, v2: string, optionsOrLoose?: any): boolean;
  export function neq(v1: string, v2: string, optionsOrLoose?: any): boolean;
}
