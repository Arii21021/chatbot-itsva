import React, { useEffect, useState } from "react";
import AuthLayout from "./components/AuthLayout";
import Chatbot from "./components/Chatbot";

const STORAGE_KEY = "ariel_auth_user";

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  // Al iniciar la app, leer usuario guardado en localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.email && parsed.token) {
          setUser(parsed);
        }
      }
    } catch (err) {
      console.error("Error leyendo usuario guardado:", err);
    } finally {
      setBooting(false);
    }
  }, []);

  // Cuando el login/registro sea exitoso
  const handleAuthSuccess = (authData) => {
    setUser(authData);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
    } catch (err) {
      console.error("No se pudo guardar la sesión:", err);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  if (booting) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="app-title">Ariel · Chat IA</h1>
          <p className="app-subtitle">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      {user ? (
        <Chatbot user={user} onLogout={handleLogout} />
      ) : (
        <AuthLayout onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}
