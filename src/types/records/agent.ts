/**
 * `agent` record — the unified personnel type. Covers player agents, DG NPC
 * agents, and friendlies.
 *
 * Per design doc §6.5. Sub-mode is keyed off `role`:
 *
 *   - `player_agent` enables Statistics, Bonds, Motivations, Psych Status
 *   - `agent`        enables Operational Details (cell, handler, clearance)
 *   - `friendly`     enables Friendly Details (expertise, awareness, etc.)
 *
 * Per the design doc the legacy `personnel` alias for old `agent` records
 * does not survive into production. `agent` is the only personnel type.
 *
 * The TypeScript layer keeps role-specific fields as optional rather than
 * splitting `AgentData` into three exclusive variants. This matches the
 * form-panel behaviour (§9.2): switching the role select live re-shows the
 * correct field set without losing values in hidden fields, so the data
 * shape must tolerate all field combinations.
 */

import type { BaseData, Bond, RecordRow } from './common';

export type AgentRole = 'player_agent' | 'agent' | 'friendly';

export type AgentStatus = 'active' | 'retired' | 'kia' | 'mia' | 'compromised';

export type FriendlyAwareness = 'unaware' | 'suspicious' | 'partial' | 'full';

export type FriendlyReliability = 'unknown' | 'unreliable' | 'mixed' | 'reliable';

export type FriendlyRiskLevel = 'low' | 'moderate' | 'high';

/**
 * Delta Green / Call of Cthulhu core attributes. Each value is 1–18.
 * Type-level constraint is `number` — range enforcement lives in the form
 * validation layer rather than in the type system.
 */
export type AgentStats = {
  str: number;
  con: number;
  dex: number;
  int: number;
  pow: number;
  cha: number;
};

export type AgentData = BaseData & {
  role: AgentRole;
  /** Alias / cover identity. */
  cover_name?: string;
  status?: AgentStatus;
  profession?: string;
  /** UUID → `organisation` record (employer / cover affiliation). */
  agency_id?: string;

  /* ---------- player-agent-only fields ---------- */
  stats?: AgentStats;
  hp?: number;
  wp?: number;
  sanity?: number;
  breaking_point?: number;
  motivations?: string[];
  bonds?: Bond[];
  disorders?: string[];
  /** Adapted-to traits (violence, helplessness, etc.). */
  adapted?: string[];
  psych_status?: string;

  /* ---------- DG-agent-only fields ---------- */
  /** UUID → `organisation` record (DG cell). */
  cell_id?: string;
  /** UUID → `agent` record (handler that runs them). */
  agent_handler_id?: string;
  clearance?: string;

  /* ---------- friendly-only fields ---------- */
  expertise?: string;
  awareness_level?: FriendlyAwareness;
  reliability?: FriendlyReliability;
  risk_level?: FriendlyRiskLevel;
  contact_method?: string;
  /** UUID → `agent` record (recruiter). */
  recruited_by_id?: string;
};

export type AgentRecord = RecordRow<'agent', AgentData>;
