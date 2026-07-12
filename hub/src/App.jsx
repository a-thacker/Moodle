import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  // The profile row (display name + owner/roommate role) drives which
  // tiles render. RLS enforces the same split server-side; this is UX.
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error("profile fetch failed:", error.message);
        setProfile(data ?? { display_name: session.user.email, role: "roommate" });
      });
  }, [session]);

  if (!supabase) {
    return (
      <div className="center-screen">
        <div className="card">
          <h1>Command Center</h1>
          <p>
            Not configured yet: set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> (hub/.env locally, or Netlify
            environment variables), then rebuild.
          </p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="center-screen">Loading…</div>;
  if (!session) return <Login />;
  if (!profile) return <div className="center-screen">Loading profile…</div>;

  return <Dashboard profile={profile} />;
}
