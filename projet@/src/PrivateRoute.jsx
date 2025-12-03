import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function PrivateRoute({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <div className="has-text-centered mt-6">Chargement...</div>;
  if (!user) {
    window.alert("Vous devez etre connecte pour acceder a cette page.");
    return <Navigate to="/connexion" replace />;
  }
  return children;
}
