import OwnerDashboard from "./components/OwnerDashboard.tsx";
import RoommateGrocery from "./components/RoommateGrocery.tsx";
import type { Role } from "./types";

// Which view to show. Until backend auth lands (Phase 2), the role is chosen
// by a `?view=roommate` query param; afterwards it comes from the logged-in
// user's profile role (owner sees everything, roommate sees grocery only).
function currentRole(): Role {
  const params = new URLSearchParams(window.location.search);
  return params.get("view") === "roommate" ? "roommate" : "owner";
}

export default function App() {
  return currentRole() === "roommate" ? <RoommateGrocery /> : <OwnerDashboard />;
}
