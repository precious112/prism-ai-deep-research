import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import logger from "./utils/logger";

const port = process.env.PORT || 3000;

import { prisma } from "./utils/prisma";

app.listen(port, async () => {
  logger.info(`Server is running at http://localhost:${port}`);

  if (process.env.OFFLINE_MODE === "true") {
    try {
      const email = "offline@prism.ai";
      const existingUser = await prisma.user.findUnique({ where: { email } });
      
      if (!existingUser) {
        await prisma.user.create({
          data: {
            email,
            firstName: "Offline",
            lastName: "User",
            password: null, // No password needed for offline user
          },
        });
        logger.info("Offline user created successfully.");
      } else {
        logger.info("Offline user already exists.");
      }
    } catch (error) {
      logger.error(error, "Failed to initialize offline user");
    }
  }
});
