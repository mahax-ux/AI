import "dotenv/config";
import express from "express";
import cors from "cors";
import { Groq } from "groq-sdk";
import Mem0 from "mem0ai";

const app = express();
app.use(express.json());
app.use(cors());

const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  console.error("Error: Missing GROQ_API_KEY in your .env file!");
  process.exit(1);
}

const groq = new Groq({ apiKey: groqApiKey });

// Initialize Mem0 Client
const memory = new Mem0({
  apiKey: process.env.MEM0_API_KEY, // Optional if running local OSS
});

// API Endpoint for chatting with Mahax + Mem0 Integration
app.post("/api/chat", async (req, res) => {
  const { message, userId, messages } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const currentUserId = userId || "guest";

  try {
    // 1. Search Mem0 for relevant past context/facts about this user
    let contextualMemories = "";
    try {
      const searchResults = await memory.search(message, {
        user_id: currentUserId,
      });
      if (searchResults && searchResults.length > 0) {
        contextualMemories = searchResults.map((item) => `- ${item.memory}`).join("\n");
      }
    } catch (memErr) {
      console.log("Mem0 search skipped/failed:", memErr.message);
    }

    // 2. Format chat history for Groq
    const chatMessages = messages && Array.isArray(messages) && messages.length > 0 
      ? messages.map(m => ({ role: m.role, content: m.content }))
      : [{ role: "user", content: message }];

    // 3. Build dynamic system prompt incorporating Mem0 facts
    let systemPrompt = `You are Mahax AI, an intelligent, helpful, and concise assistant built for Mahant. You are currently chatting with user: ${currentUserId}.`;
    
    if (contextualMemories) {
      systemPrompt += `\n\nHere is what you remember about this user from previous interactions:\n${contextualMemories}`;
    }

    // 4. Generate response via Groq
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: systemPrompt },
        ...chatMessages
      ],
      temperature: 0.7,
    });

    const agentReply = response.choices[0]?.message?.content || "I'm not sure how to respond.";

    // 5. Asynchronously save this turn to Mem0 for future context learning
    memory.add([
      { role: "user", content: message },
      { role: "assistant", content: agentReply }
    ], { user_id: currentUserId }).catch(err => console.error("Mem0 add error:", err));

    res.json({ reply: agentReply });

  } catch (err) {
    console.error("Groq/Mem0 API Error Details:", err?.message || err);
    res.status(500).json({ reply: `Error connecting to AI service: ${err?.message || "Unknown error"}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running locally at http://localhost:${PORT} with Mem0 active.`);
});
