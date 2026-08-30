import "dotenv/config";
import express from "express";
import cors from "cors";
import { Groq } from "groq-sdk";
import { MemoryClient } from "mem0ai";

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
const memory = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY, 
});

// API Endpoint for chatting with Mahax + Mem0 Integration
app.post("/api/chat", async (req, res) => {
  const { message, userId, messages } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const currentUserId = userId || "guest";

  try {
    // 1. Search Mem0 (Enhance the query for better vector matching)
    let contextualMemories = "";
    try {
      // Add general keywords to generic queries so vector search catches profile facts
      const searchQuery = message.length < 15 ? `${message} user profile identity facts` : message;
      
      const searchResults = await memory.search(searchQuery, {
        filters: { user_id: currentUserId }
      });
      
      // Safely handle both array and object responses depending on the SDK version
      const memArray = Array.isArray(searchResults) ? searchResults : searchResults?.results || searchResults?.memories || [];
      
      if (memArray && memArray.length > 0) {
        contextualMemories = memArray.map((item) => `- ${item.memory}`).join("\n");
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
      systemPrompt += `\n\nHere is what you know about this user from long-term memory:\n${contextualMemories}`;
    }

    // 4. Generate response via Groq
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // Supported Groq model ID
      messages: [
        { role: "system", content: systemPrompt },
        ...chatMessages
      ],
      temperature: 0.7,
    });

    const agentReply = response.choices[0]?.message?.content || "I'm not sure how to respond.";

    // 5. AWAIT the save to ensure Mem0 finishes extracting facts before moving on
    await memory.add([
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
