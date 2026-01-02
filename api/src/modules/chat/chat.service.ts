import { prisma } from "../../utils/prisma";
import AppError from "../../utils/AppError";
import redisClient from "../../utils/redis";
import logger from "../../utils/logger";

export const createChat = async (userId: string, data: { title?: string, organizationId?: string }) => {
  return await prisma.chat.create({
    data: {
      userId,
      title: data.title || "New Chat",
      organizationId: data.organizationId,
    },
  });
};

export const getChatsByUser = async (userId: string, page: number = 1, limit: number = 20) => {
  const skip = (page - 1) * limit;
  const chats = await prisma.chat.findMany({
    where: { userId },
    skip,
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });
  const total = await prisma.chat.count({ where: { userId } });
  return { chats, total, page, limit };
};

export const getChatById = async (chatId: string, userId: string) => {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
  });
  if (!chat) throw new AppError(404, "Chat not found");
  return chat;
};

export const updateChat = async (chatId: string, userId: string, data: { title: string }) => {
  return await prisma.chat.update({
    where: { id: chatId },
    data: { title: data.title },
  });
};

export const deleteChat = async (chatId: string, userId: string) => {
  await prisma.chat.delete({ where: { id: chatId } });
};

export const addMessage = async (
  chatId: string,
  userId: string | null,
  content: string,
  role: string = "user",
  config?: { model?: string; provider?: string; apiKey?: string; includeIllustrations?: boolean }
) => {
  logger.info(`addMessage called for chat ${chatId} with role ${role}`);

  if (userId) {
    // Check handled by middleware
  } else {
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) throw new AppError(404, "Chat not found");
  }

  const result = await prisma.$transaction(async (tx: any) => {
    const message = await tx.message.create({
      data: {
        chatId,
        userId,
        role,
        content,
      },
    });

    let researchRequest = null;
    if (role === "user") {
      logger.info("Creating research request for user message");
      researchRequest = await tx.researchRequest.create({
        data: {
          messageId: message.id,
          status: "PENDING",
        },
      });
    }

    return { message, researchRequest };
  });

  if (result.researchRequest) {
    // Fetch full chat history (excluding current message)
    const history = await prisma.message.findMany({
      where: {
        chatId: chatId,
        id: { not: result.message.id },
      },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        content: true,
      },
    });

    logger.info(`Pushing research task to Redis for request ${result.researchRequest.id}`);
    try {
      await redisClient.rpush(
        "research_tasks",
        JSON.stringify({
          requestId: result.researchRequest.id,
          userId: userId,
          chatId: chatId,
          query: content,
          history: history,
          config: config || {},
        })
      );
      logger.info("Successfully pushed task to Redis");
    } catch (error) {
      logger.error(error, "Failed to push task to Redis");
      // We don't want to fail the request if redis push fails, but maybe we should?
      // For now, let's log it.
    }
  } else {
    logger.info("No research request to push (role not user?)");
  }

  return result.message;
};

export const getMessages = async (chatId: string, userId: string, page: number = 1, limit: number = 20) => {
  const skip = (page - 1) * limit;
  
  const messages = await prisma.message.findMany({
    where: { chatId },
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      researchRequests: {
        include: {
          researchResult: true,
        },
      },
    },
  });
  
  const total = await prisma.message.count({ where: { chatId } });
  return { messages, total, page, limit };
};

export const getChatsByOrganization = async (userId: string, organizationId: string, page: number = 1, limit: number = 20) => {
  const skip = (page - 1) * limit;
  const chats = await prisma.chat.findMany({
    where: { organizationId },
    skip,
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });
  const total = await prisma.chat.count({ where: { organizationId } });
  return { chats, total, page, limit };
};
