/**
 * Type tests for Server props typing. Compile-time only — this file is
 * typechecked but never executed (vitest only picks up `*.test.ts`).
 *
 * Interfaces do not get implicit index signatures in TypeScript, so a
 * `Record<string, unknown>` bound rejects user-defined interfaces with
 * "Index signature for type 'string' is missing". Props bounds must accept
 * plain interfaces while still rejecting non-object props.
 */
import { Server, getServerByName, routePartykitRequest } from "../index";

// A well-defined interface with NO index signature.
interface AuthProps {
  userId: string;
  permissions: string[];
}

declare const authProps: AuthProps;
declare const env: Cloudflare.Env;
declare const request: Request;

// ============================================
// POSITIVE TESTS - interface props must be accepted
// ============================================

// Server must be instantiable with interface Props.
declare class AuthServer extends Server<Cloudflare.Env, AuthProps> {}
declare const serverNamespace: DurableObjectNamespace<AuthServer>;

// getServerByName must accept interface-typed props.
getServerByName(serverNamespace, "instance", { props: authProps });

// onStart receives the interface type.
declare const authServer: AuthServer;
authServer.onStart(authProps);

// routePartykitRequest must accept interface-typed props.
routePartykitRequest(request, env, { props: authProps });

// ============================================
// NEGATIVE TESTS - non-object props stay rejected
// ============================================

// @ts-expect-error — a primitive is not a props bag
declare class BadServer extends Server<Cloudflare.Env, string> {}

getServerByName(serverNamespace, "instance", {
  // @ts-expect-error — a primitive is not a props bag
  props: "not-an-object"
});

// Silence unused-declaration noise; this file only exists to typecheck.
export type {};
