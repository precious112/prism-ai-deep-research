import express, { Express, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import "./config/passport"; // Import passport config
import swaggerUi from "swagger-ui-express";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { organizationsRouter } from "./modules/organizations/organizations.routes";
import { chatRouter } from "./modules/chat/chat.routes";
import { researchRouter } from "./modules/research/research.routes";
import { errorHandler } from "./middleware/errorHandler";
import { generateOpenAPI } from "./utils/swagger";

const app: Express = express();

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000").split(",");

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use(passport.initialize() as any);

app.get("/health", (req: Request, res: Response) => {
  res.status(200).send("OK");
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(generateOpenAPI()));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/chats", chatRouter);
app.use("/api/research", researchRouter);

app.use(errorHandler);

export default app;
