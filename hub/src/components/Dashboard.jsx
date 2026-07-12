import { supabase } from "../lib/supabase.js";
import GradesWidget from "./GradesWidget.jsx";
import DeadlinesWidget from "./DeadlinesWidget.jsx";
import GroceryList from "./GroceryList.jsx";

// Tile grid. Grades/Deadlines are owner-only (RLS blocks the data anyway;
// hiding the tiles keeps the roommate's view clean). Shared tools render
// for everyone.
export default function Dashboard({ profile }) {
  const isOwner = profile.role === "owner";

  return (
    <div className="dashboard">
      <header>
        <h1>Command Center</h1>
        <div className="header-right">
          <span>{profile.display_name}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="tile-grid">
        {isOwner && <GradesWidget />}
        {isOwner && <DeadlinesWidget />}
        <GroceryList profile={profile} />
      </main>
    </div>
  );
}
