import axios from 'axios';
import config from '../config/index.js';
import { handleFulfilled, handleRejected, handleRequest } from './utils/index.js';

export const EVENT_TYPE_MESSAGE = 'message';
export const EVENT_TYPE_POSTBACK = 'postback';

export const SOURCE_TYPE_USER = 'user';
export const SOURCE_TYPE_GROUP = 'group';

export const MESSAGE_TYPE_TEXT = 'text';
export const MESSAGE_TYPE_STICKER = 'sticker';
export const MESSAGE_TYPE_AUDIO = 'audio';
export const MESSAGE_TYPE_IMAGE = 'image';
export const MESSAGE_TYPE_TEMPLATE = 'template';

export const TEMPLATE_TYPE_BUTTONS = 'buttons';

export const ACTION_TYPE_MESSAGE = 'message';
export const ACTION_TYPE_POSTBACK = 'postback';

export const QUICK_REPLY_TYPE_ACTION = 'action';

const client = axios.create({
  baseURL: 'https://api.line.me',
  timeout: config.LINE_TIMEOUT,
  headers: {
    'Accept-Encoding': 'gzip, deflate, compress',
  },
});

client.interceptors.request.use((c) => {
  c.headers.Authorization = `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`;
  return handleRequest(c);
});

client.interceptors.response.use(handleFulfilled, (err) => {
  if (err.response?.data?.message) {
    err.message = err.response.data.message;
  }
  return handleRejected(err);
});

const reply = ({
  replyToken,
  messages,
}) => client.post('/v2/bot/message/reply', {
  replyToken,
  messages,
});

const fetchGroupSummary = ({
  groupId,
}) => client.get(`/v2/bot/group/${groupId}/summary`);

const fetchProfile = ({
  userId,
}) => client.get(`/v2/bot/profile/${userId}`);

const dataClient = axios.create({
  baseURL: 'https://api-data.line.me',
  timeout: config.LINE_TIMEOUT,
  headers: {
    'Accept-Encoding': 'gzip, deflate, compress',
  },
});

dataClient.interceptors.request.use((c) => {
  c.headers.Authorization = `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`;
  return handleRequest(c);
});

dataClient.interceptors.response.use(handleFulfilled, (err) => {
  if (err.response?.data?.message) {
    err.message = err.response.data.message;
  }
  return handleRejected(err);
});

const fetchContent = ({
  messageId,
}) => dataClient.get(`/v2/bot/message/${messageId}/content`, {
  responseType: 'arraybuffer',
});

// Process incoming messages
const processMessage = async ({ message, replyToken }) => {
  // Ignore messages that don't start with "Ai "
  if (message.type !== MESSAGE_TYPE_TEXT || !message.text.startsWith("Ai ")) {
    return; // Do nothing
  }

  // Process messages starting with "Ai "
  try {
    const aiResponse = await createChatCompletion({
      messages: [{ role: ROLE_HUMAN, content: message.text.slice(3) }],
    });
    await reply({
      replyToken,
      messages: [{ type: MESSAGE_TYPE_TEXT, text: aiResponse.data.choices[0].message.content }],
    });
  } catch (error) {
    console.error('Error processing AI response:', error);
    await reply({
      replyToken,
      messages: [{ type: MESSAGE_TYPE_TEXT, text: 'Sorry, I encountered an error processing your request.' }],
    });
  }
};

export {
  reply,
  fetchGroupSummary,
  fetchProfile,
  fetchContent,
  processMessage,
};
