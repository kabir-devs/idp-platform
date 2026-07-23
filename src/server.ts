import express from "express";
import cors from "cors";
import path from "path";
import apiRoutes from "./routes";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json());
app.use("/api", apiRoutes);
app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`Internal Developer Platform listening on http://localhost:${PORT}`);
});
