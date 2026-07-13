// Sync-agent panel — reflects the local agent's runs (session health,
// last/next run, notify channel). When the eClass session expires the agent
// exits code 2; that surfaces here as an unhealthy session + re-login banner.

import type { ReactNode } from "react";

import type { AgentStatus } from "../types";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--color-neutral-400)" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export default function SyncAgentCard({ agent }: { agent: AgentStatus }) {
  return (
    <section className="card" style={{ padding: "var(--space-6)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-4)" }}>
        <i className="ph ph-heartbeat" style={{ color: "var(--color-accent)" }} />
        <span className="card-title" style={{ fontSize: 15 }}>Sync agent</span>
      </div>

      {!agent.sessionHealthy && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: "var(--space-4)",
            padding: "9px 11px",
            borderRadius: "var(--radius-md)",
            background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
            border: "1px solid var(--color-accent-700)",
            fontSize: 12,
          }}
        >
          <i className="ph ph-warning" style={{ color: "var(--color-accent-200)" }} />
          <span>
            eClass session expired — run{" "}
            <code style={{ color: "var(--color-accent-100)" }}>python -m eclass.main login</code> on your Mac.
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
        <Row label="eClass session">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              className="status-dot"
              style={agent.sessionHealthy ? undefined : { background: "var(--color-accent-400)" }}
            />
            {agent.sessionHealthy ? "healthy" : "expired"}
          </span>
        </Row>
        <Row label="Last run">{agent.lastRun}</Row>
        <Row label="Next run">
          <span style={{ color: "var(--color-neutral-300)" }}>{agent.nextRun}</span>
        </Row>
        <Row label="Notify">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <i className="ph ph-device-mobile" style={{ fontSize: 13, color: "var(--color-neutral-400)" }} />
            {agent.notifyChannel}
          </span>
        </Row>
      </div>
    </section>
  );
}
