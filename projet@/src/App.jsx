import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import "./App.css";
import { auth, firestore } from "./firebase";
import AdminDashboard from "./components/AdminDashboard";
import TeacherDashboard from "./components/TeacherDashboard";

const ADMIN_EMAILS = ["coordonnateur@appweb.demo", "admin@example.com"];

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setRole(null);
        setLoading(false);
        return;
      }

      const fallbackRole = ADMIN_EMAILS.includes(currentUser.email)
        ? "admin"
        : "enseignant";
      try {
        const userRef = doc(firestore, "users", currentUser.uid);
        const snapshot = await getDoc(userRef);
        if (!snapshot.exists()) {
          await setDoc(
            userRef,
            {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName || currentUser.email,
              role: fallbackRole,
            },
            { merge: true }
          );
          setRole(fallbackRole);
        } else {
          const data = snapshot.data();
          const nextRole = data.role || fallbackRole;
          if (nextRole !== data.role) {
            await setDoc(userRef, { role: nextRole }, { merge: true });
          }
          setRole(nextRole);
        }
      } catch (error) {
        console.error("role initialisation", error);
        setRole(fallbackRole);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  if (loading) {
    return <div className="page-loader">Chargement de la plateforme...</div>;
  }

  return (
    <main className="app-shell">
      <div className="role-banner">
        <div>
          <p className="panel-label">Plateforme de validation</p>
          <h1>
            {role === "admin"
              ? "Coordination - Validation des plans de cours"
              : "Espace enseignant - Creation des plans"}
          </h1>
          <p className="hint">Connecte en tant que {user?.displayName || user?.email}</p>
        </div>
        <span className={`status-pill ${role === "admin" ? "status-success" : ""}`}>
          {role === "admin" ? "Administrateur" : "Enseignant"}
        </span>
      </div>
      {role === "admin" ? (
        <AdminDashboard user={user} />
      ) : (
        <TeacherDashboard user={user} />
      )}
    </main>
  );
}

export default App;
