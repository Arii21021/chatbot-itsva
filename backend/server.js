require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

// Config
const PORT = process.env.PORT || 4000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/ariel_chatbot";

// 🔗 CONEXIÓN A MONGODB
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("✅ Conectado a MongoDB");
  })
  .catch((err) => {
    console.error("❌ Error al conectar a MongoDB:", err.message);
  });

// Middlewares
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

// 🔍 LOG DE TODAS LAS PETICIONES
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.url}`);
  next();
});

// ---------------------------
// Rutas
// ---------------------------

// Auth
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

// Chat (LLAMA / LM STUDIO)
const chatRoutes = require("./routes/chat");
app.use("/api/chat", chatRoutes);

// Ruta de prueba
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend de Ariel funcionando 🚀",
    time: new Date().toISOString(),
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor backend escuchando en http://localhost:${PORT}`);
});
