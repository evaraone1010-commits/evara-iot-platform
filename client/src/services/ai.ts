import api from './api';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export const sendMessageToAI = async (message: string, context?: Record<string, unknown>): Promise<string> => {
    const response = await api.post<{ response: string }>('/ai/chat', {
        message,
        context
    });
    return response.data.response;
};
