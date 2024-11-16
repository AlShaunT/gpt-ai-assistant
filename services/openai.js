import express from 'express';
import axios from 'axios';
import FormData from 'form-data';
import config from '../config/index.js';
import { handleFulfilled, handleRejected, handleRequest } from './utils/index.js';

export const ROLE_SYSTEM = 'system';
export const ROLE_AI = 'assistant';
export const ROLE_HUMAN = 'user';

export const FINISH_REASON_STOP = 'stop';
export const FINISH_REASON_LENGTH = 'length';

export const IMAGE_SIZE_256 = '256x256';
export const IMAGE_SIZE_512 = '512x512';
export const IMAGE_SIZE_1024 = '1024x1024';

export const MODEL_GPT_3_5_TURBO = 'gpt-3.5-turbo';
export const MODEL_GPT_4_OMNI = 'gpt-4o';
export const MODEL_WHISPER_1 = 'whisper-1';
export const MODEL_DALL_E_3 = 'dall-e-3';

const client = axios.create({
  baseURL: config.OPENAI_BASE_URL,
  timeout: config.OPENAI_TIMEOUT,
  headers: {
    'Accept-Encoding': 'gzip, deflate, compress',
  },
});

client.interceptors.request.use((c) => {
  c.headers.Authorization = `Bearer ${config.OPENAI_API_KEY}`;
  return handleRequest(c);
});

client.interceptors.response.use(handleFulfilled, (err) => {
  if (err.response?.data?.error?.message) {
    err.message = err.response.data.error.message;
  }
  return handleRejected(err);
});

const hasImage = ({ messages }) => (
  messages.some(({ content }) => (
    Array.isArray(content) && content.some((item) => item.image_url)
  ))
);

const createChatCompletion = ({
  model = config.OPENAI_COMPLETION_MODEL,
  messages,
  temperature = config.OPENAI_COMPLETION_TEMPERATURE,
  maxTokens = config.OPENAI_COMPLETION_MAX_TOKENS,
  frequencyPenalty = config.OPENAI_COMPLETION_FREQUENCY_PENALTY,
  presencePenalty = config.OPENAI_COMPLETION_PRESENCE_PENALTY,
}) => {
  const body = {
    model: hasImage({ messages }) ? config.OPENAI_VISION_MODEL : model,
    messages,
    temperature,
    max_tokens: maxTokens,
    frequency_penalty: frequencyPenalty,
    presence_penalty: presencePenalty,
  };
  return client.post('/v1/chat/completions', body);
};

const createImage = ({
  model = config.OPENAI_IMAGE_GENERATION_MODEL,
  prompt,
  size = config.OPENAI_IMAGE_GENERATION_SIZE,
  quality = config.OPENAI_IMAGE_GENERATION_QUALITY,
  n = 1,
}) => {
  if (model === MODEL_DALL_E_3 && [IMAGE_SIZE_256, IMAGE_SIZE_512].includes(size)) {
    size = IMAGE_SIZE_1024;
  }

  return client.post('/v1/images/generations', {
    model,
    prompt,
    size,
    quality,
    n,
  });
};

const createAudioTranscriptions = ({
  buffer,
  file,
  model = MODEL_WHISPER_1,
}) => {
  const formData = new FormData();
  formData.append('file', buffer, file);
  formData.append('model', model);
  return client.post('/v1/audio/transcriptions', formData.getBuffer(), {
    headers: formData.getHeaders(),
  });
};

// Function to handle incoming LINE messages
const handleLineMessage = async (lineMessage) => {
  const { text } = lineMessage;

  // Filter messages that start with "Ai "
  if (!text || !text.startsWith("Ai ")) {
    console.log("Message ignored: does not start with 'Ai '");
    return { reply: "Message ignored. Start your message with 'Ai ' to chat with me." };
  }

  // Extract the message content after "Ai "
  const prompt = text.slice(3).trim();

  try {
    const response = await createChatCompletion({
      messages: [{ role: ROLE_HUMAN, content: prompt }],
    });

    // Return the AI's reply
    return { reply: response.data.choices[0].message.content };
  } catch (err) {
    console.error("Error processing message:", err.message);
    return { reply: "Sorry, something went wrong." };
  }
};

// Express Webhook Integration
const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  // Process each incoming event
  const responses = await Promise.all(
    events.map(async (event) => {
      if (event.type === 'message' && event.message.type === 'text') {
        const lineMessage = { text: event.message.text };

        // Use handleLineMessage to process the message
        const { reply } = await handleLineMessage(lineMessage);

        return {
          replyToken: event.replyToken,
          message: reply,
        };
      }

      return null; // Ignore non-text or non-message events
    })
  );

  // Reply to LINE with the processed messages
  responses.forEach(async ({ replyToken, message }) => {
    if (replyToken && message) {
      await axios.post(
        'https://api.line.me/v2/bot/message/reply',
        {
          replyToken,
          messages: [{ type: 'text', text: message }],
        },
        {
          headers: {
            Authorization: `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`,
          },
        }
      );
    }
  });

  res.status(200).end();
});

app.listen(3000, () => console.log('Server running on port 3000'));

export {
  createAudioTranscriptions,
  createChatCompletion,
  createImage,
  handleLineMessage, // Export this function for use in your LINE webhook
};
