import React, { useState, useEffect } from "react";

const API_BASE = "http://localhost:4000/api";
const THEME_KEY = "itsva_theme"; // dark | light

export default function AuthLayout({ onAuthSuccess }) {
  // vistas: login | register | forgot
  const [view, setView] = useState("login");

  // --- función de validación de correo institucional ---
  // ej: l21070083@valladolid.tecnm.mx
  const isInstitutionalEmail = (value) => {
    const regex = /^[lL][0-9]+@valladolid\.tecnm\.mx$/;
    return regex.test(value.trim());
  };

  // --------- tema (load + apply) ----------
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const initial = saved === "light" ? "light" : "dark";

    if (initial === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, []);

  // --- estados login ---
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // --- estados registro ---
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  // --- estados recuperar contraseña ---
  // paso: email -> code
  const [forgotStep, setForgotStep] = useState("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPass, setForgotNewPass] = useState("");
  const [forgotConfirmPass, setForgotConfirmPass] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotInfo, setForgotInfo] = useState("");

  // ----------------- LOGIN -----------------
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");

    if (!loginEmail || !loginPass) {
      setLoginError("Completa todos los campos.");
      return;
    }

    if (!isInstitutionalEmail(loginEmail)) {
      setLoginError(
        "Usa tu correo institucional (L + matrícula@valladolid.tecnm.mx)."
      );
      return;
    }

    setLoginLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.error || "Error al iniciar sesión.");
        return;
      }

      onAuthSuccess({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        token: data.token,
      });
    } catch (err) {
      console.error("Error en login frontend:", err);
      setLoginError("No se pudo conectar con el servidor.");
    } finally {
      setLoginLoading(false);
    }
  };

  // ----------------- REGISTRO -----------------
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError("");

    if (!regName || !regEmail || !regPass || !regConfirm) {
      setRegError("Todos los campos son obligatorios.");
      return;
    }

    if (!isInstitutionalEmail(regEmail)) {
      setRegError(
        "Usa tu correo institucional (L + matrícula@valladolid.tecnm.mx)."
      );
      return;
    }

    if (regPass !== regConfirm) {
      setRegError("Las contraseñas no coinciden.");
      return;
    }

    setRegLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPass,
          confirmPassword: regConfirm,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRegError(data.error || "Error al registrarse.");
        return;
      }

      onAuthSuccess({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        token: data.token,
      });
    } catch (err) {
      console.error("Error en registro frontend:", err);
      setRegError("No se pudo conectar con el servidor.");
    } finally {
      setRegLoading(false);
    }
  };

  // ----------------- OLVIDÉ MI CONTRASEÑA (demo) -----------------
  const handleForgotEmailSubmit = (e) => {
    e.preventDefault();
    setForgotError("");
    setForgotInfo("");

    if (!forgotEmail) {
      setForgotError("Ingresa tu correo institucional.");
      return;
    }

    if (!isInstitutionalEmail(forgotEmail)) {
      setForgotError(
        "Usa tu correo institucional (L + matrícula@valladolid.tecnm.mx)."
      );
      return;
    }

    setForgotInfo(
      "Hemos enviado un código a tu correo institucional. (En modo demo usa el código: 123456)"
    );
    setForgotStep("code");
  };

  const handleForgotResetSubmit = (e) => {
    e.preventDefault();
    setForgotError("");
    setForgotInfo("");

    if (!forgotCode || !forgotNewPass || !forgotConfirmPass) {
      setForgotError("Completa todos los campos.");
      return;
    }

    if (forgotCode !== "123456") {
      setForgotError("El código ingresado no es válido.");
      return;
    }

    if (forgotNewPass !== forgotConfirmPass) {
      setForgotError("Las contraseñas no coinciden.");
      return;
    }

    setForgotInfo(
      "Contraseña restablecida correctamente. Ahora puedes iniciar sesión."
    );

    setForgotNewPass("");
    setForgotConfirmPass("");
    setForgotCode("");
  };

  return (
    <div className="auth-page">
      {/* Logo grande arriba / fondo (fuera del cuadro) */}
      <div className="auth-hero">
        <img
          src="/Logo-login.png"
          alt="Tecnológico Nacional de México"
          className="auth-hero-logo"
        />
      </div>

      <div className="auth-card">
        {/* Header de la tarjeta: logo pequeño + título */}
        <div className="auth-card-header">
          <img
            src="/itsva-logo.png"
            alt="ITSVA"
            className="auth-card-logo"
          />
          <div>
            <h1 className="app-title">ITSVA · Chat IA</h1>
            <p className="app-subtitle">
              Accede con tu correo institucional para utilizar el asistente académico.
            </p>
          </div>
        </div>

        {/* Tabs solo para login y registro */}
        {view !== "forgot" && (
          <div className="auth-tabs">
            <button
              className={`auth-tab ${view === "login" ? "active" : ""}`}
              onClick={() => setView("login")}
            >
              Iniciar sesión
            </button>
            <button
              className={`auth-tab ${view === "register" ? "active" : ""}`}
              onClick={() => setView("register")}
            >
              Registrarse
            </button>
          </div>
        )}

        {/* -------- LOGIN -------- */}
        {view === "login" && (
          <>
            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <label>
                Correo institucional
                <input
                  type="email"
                  placeholder="l21070083@valladolid.tecnm.mx"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </label>

              <label>
                Contraseña
                <input
                  type="password"
                  placeholder="••••••••"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                />
              </label>

              {loginError && <div className="auth-error">{loginError}</div>}

              <button
                className="auth-button"
                type="submit"
                disabled={loginLoading}
              >
                {loginLoading ? "Entrando..." : "Iniciar sesión"}
              </button>
            </form>

            <div className="auth-footer">
              <span
                className="auth-link"
                onClick={() => {
                  setView("forgot");
                  setForgotStep("email");
                  setForgotError("");
                  setForgotInfo("");
                }}
              >
                Olvidé mi contraseña
              </span>
              <br />
              <span>
                ¿No tienes cuenta?{" "}
                <span className="auth-link" onClick={() => setView("register")}>
                  Regístrate
                </span>
              </span>
            </div>
          </>
        )}

        {/* -------- REGISTRO -------- */}
        {view === "register" && (
          <>
            <form className="auth-form" onSubmit={handleRegisterSubmit}>
              <label>
                Nombre completo
                <input
                  type="text"
                  placeholder="Tu nombre"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
              </label>

              <label>
                Correo institucional
                <input
                  type="email"
                  placeholder="l21070083@valladolid.tecnm.mx"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                />
              </label>

              <label>
                Contraseña
                <input
                  type="password"
                  placeholder="••••••••"
                  value={regPass}
                  onChange={(e) => setRegPass(e.target.value)}
                />
              </label>

              <label>
                Confirmar contraseña
                <input
                  type="password"
                  placeholder="••••••••"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                />
              </label>

              {regError && <div className="auth-error">{regError}</div>}

              <button
                className="auth-button"
                type="submit"
                disabled={regLoading}
              >
                {regLoading ? "Creando cuenta..." : "Registrarme"}
              </button>
            </form>

            <div className="auth-footer">
              <span>
                ¿Ya tienes cuenta?{" "}
                <span className="auth-link" onClick={() => setView("login")}>
                  Inicia sesión
                </span>
              </span>
            </div>
          </>
        )}

        {/* -------- OLVIDÉ MI CONTRASEÑA -------- */}
        {view === "forgot" && (
          <>
            {forgotStep === "email" && (
              <>
                <p className="app-subtitle" style={{ marginTop: "0.5rem" }}>
                  Ingresa tu correo institucional para recibir un código de recuperación.
                </p>

                <form className="auth-form" onSubmit={handleForgotEmailSubmit}>
                  <label>
                    Correo institucional
                    <input
                      type="email"
                      placeholder="l21070083@valladolid.tecnm.mx"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                    />
                  </label>

                  {forgotError && <div className="auth-error">{forgotError}</div>}

                  {forgotInfo && (
                    <div className="auth-info">
                      {forgotInfo}
                    </div>
                  )}

                  <button className="auth-button" type="submit">
                    Enviar código
                  </button>
                </form>

                <div className="auth-footer">
                  <span className="auth-link" onClick={() => setView("login")}>
                    Volver a iniciar sesión
                  </span>
                </div>
              </>
            )}

            {forgotStep === "code" && (
              <>
                <p className="app-subtitle" style={{ marginTop: "0.5rem" }}>
                  Ingresa el código que recibiste y crea una nueva contraseña.
                </p>

                <form className="auth-form" onSubmit={handleForgotResetSubmit}>
                  <label>
                    Código de verificación
                    <input
                      type="text"
                      placeholder="Código (ej. 123456)"
                      value={forgotCode}
                      onChange={(e) => setForgotCode(e.target.value)}
                    />
                  </label>

                  <label>
                    Nueva contraseña
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={forgotNewPass}
                      onChange={(e) => setForgotNewPass(e.target.value)}
                    />
                  </label>

                  <label>
                    Confirmar nueva contraseña
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={forgotConfirmPass}
                      onChange={(e) => setForgotConfirmPass(e.target.value)}
                    />
                  </label>

                  {forgotError && <div className="auth-error">{forgotError}</div>}

                  {forgotInfo && <div className="auth-success">{forgotInfo}</div>}

                  <button className="auth-button" type="submit">
                    Restablecer contraseña
                  </button>
                </form>

                <div className="auth-footer">
                  <span
                    className="auth-link"
                    onClick={() => {
                      setView("login");
                      setForgotStep("email");
                    }}
                  >
                    Volver a iniciar sesión
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
