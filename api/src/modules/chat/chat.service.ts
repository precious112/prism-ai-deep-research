import { prisma } from "../../utils/prisma";
import AppError from "../../utils/AppError";
import redisClient from "../../utils/redis";

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
  config?: { model?: string; apiKey?: string }
) => {
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
    await redisClient.publish(
      "research_tasks",
      JSON.stringify({
        requestId: result.researchRequest.id,
        query: content,
        config: config || {},
      })
    );
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
