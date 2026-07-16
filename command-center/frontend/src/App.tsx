import { AuthProvider, useAuth } from "./auth/AuthContext.tsx";
import Login from "./components/Login.tsx";
import AppShell from "./components/AppShell.tsx";

// Every authenticated user gets the same shell; what they see inside it is
// driven by their capabilities (owner is the admin with everything). Roles are
// just owner vs. user now — no more per-role dashboards.
function Routed() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg)",
          color: "var(--color-neutral-500)",
          fontFamily: "var(--font-body)",
        }}
      >
        Loading…
      </div>
    );
  }
  if (!user) return <Login />;
  return <AppShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routed />
    </AuthProvider>
  );
}
