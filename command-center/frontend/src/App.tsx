import { AuthProvider, useAuth } from "./auth/AuthContext.tsx";
import Login from "./components/Login.tsx";
import OwnerDashboard from "./components/OwnerDashboard.tsx";
import RoommateGrocery from "./components/RoommateGrocery.tsx";

// Role now comes from the authenticated user (owner sees everything, roommate
// sees grocery only) — replacing the old ?view= query param.
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
  return user.role === "owner" ? <OwnerDashboard /> : <RoommateGrocery />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routed />
    </AuthProvider>
  );
}
