// cs-unmet

/**
 * crosswords' types that reach React — the exported types `types.ts` cannot
 * hold, since a type built on an `Action` does not belong beside the data
 * (docs/code-conventions.md → A game's types). Every other exported type is in
 * `types.ts`.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { GScope } from './types'

/** The three scopes of one assistance family, each its own action. */
export type GScopeActions = Record<GScope, Action>
